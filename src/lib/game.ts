import { createHash, randomBytes } from "node:crypto";

export type Team = "Mafia" | "Town" | "Neutral";
export type Ability = "night_vote" | "protect" | "inspect" | "none";
export type Phase = "lobby" | "reveal" | "night" | "morning" | "discussion" | "voting" | "result" | "game_over";
export type RevealRule = "immediate" | "game_end" | "never";
export type TieRule = "none" | "revote";
export type ActionMode = "guided" | "device";
export type Settings = {
  nightSeconds: number; discussionSeconds: number; votingSeconds: number;
  revealRoles: RevealRule; tieRule: TieRule; autoAdvance: boolean;
  spectatorJoin: boolean; actionMode: ActionMode;
};
export type Role = { id: string; name: string; team: Team; ability: Ability; count: number; objective: string };
export type Player = { id: string; name: string; roleId: string | null; alive: boolean; spectator: boolean };
export type Elimination = { playerId: string; playerName: string; wasMafia: boolean; roleName: string | null };
export type Announcement = { kind: "night" | "vote"; eliminations: Elimination[]; noElimination: boolean };
export type Room = {
  code: string; hostName: string; capacity: number; phase: Phase; round: number;
  players: Player[]; roles: Role[]; settings: Settings; announcement: Announcement | null;
  winner: string | null; revision: number; createdAt: number; expiresAt: number;
  phaseEndsAt: number | null; paused: boolean; remainingMs: number | null;
  nightActions: Record<string, string>; inspectionResults: Record<string, { targetId: string; wasMafia: boolean }>;
  votes: Record<string, string>; voteRound: number; tieNotice: boolean; readyIds: string[];
};
type Credential = { code: string; playerId: string | null; host: boolean; pending?: boolean; requestedAt?: number };
type GameStore = { rooms: Map<string, Room>; credentials: Map<string, Credential> };
export type StoredRoom = { room: Room; credentials: Array<[string, Credential]> };
export type Session = { code: string; token: string; playerId: string; pending?: boolean };

export const ROOM_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const defaultSettings: Settings = {
  nightSeconds: 120, discussionSeconds: 300, votingSeconds: 120,
  revealRoles: "never", tieRule: "none", autoAdvance: false,
  spectatorJoin: false, actionMode: "guided"
};

declare global { var nookplayStore: GameStore | undefined; }
const localStore: GameStore = globalThis.nookplayStore ??= { rooms: new Map(), credentials: new Map() };
let activeStore: GameStore | null = null;
const store = {
  get rooms() { return (activeStore ?? localStore).rooms; },
  get credentials() { return (activeStore ?? localStore).credentials; }
};
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const token = () => randomBytes(32).toString("hex");
const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
const cleanName = (value: unknown) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").toUpperCase().slice(0, 22) : "";
function fail(message: string, status = 400): never { throw new GameError(message, status); }
export class GameError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }

function normalizeRoom(room: Room) {
  // Rooms created before this version keep their players and roles.
  room.settings = { ...defaultSettings, ...room.settings };
  room.expiresAt ??= room.createdAt + ROOM_LIFETIME_MS;
  room.phaseEndsAt ??= null;
  room.paused ??= false;
  room.remainingMs ??= null;
  room.nightActions ??= {};
  room.inspectionResults ??= {};
  room.votes ??= {};
  room.voteRound ??= 1;
  room.tieNotice ??= false;
  room.readyIds ??= [];
  room.players.forEach(player => { player.spectator ??= false; player.name = cleanName(player.name); });
  room.roles.forEach(role => { role.objective ??= defaultObjective(role.team, role.ability); });
  if (room.announcement && !room.announcement.eliminations) {
    const old = room.announcement as Announcement & { playerId?: string | null; playerName?: string | null; wasMafia?: boolean | null };
    room.announcement = { kind: old.kind, noElimination: old.noElimination, eliminations: old.playerId && old.playerName ? [{ playerId: old.playerId, playerName: cleanName(old.playerName), wasMafia: old.wasMafia === true, roleName: room.roles.find(role => role.id === room.players.find(player => player.id === old.playerId)?.roleId)?.name ?? null }] : [] };
  }
}

export function runWithState<T extends { code: string }>(state: StoredRoom | null, operation: () => T): { result: T; state: StoredRoom } {
  const previous = activeStore;
  const current: GameStore = { rooms: new Map(state ? [[state.room.code, state.room]] : []), credentials: new Map(state?.credentials ?? []) };
  if (state) normalizeRoom(state.room);
  activeStore = current;
  try {
    const result = operation();
    const room = current.rooms.get(result.code);
    if (!room) fail("Room state is missing.", 500);
    return { result, state: { room, credentials: [...current.credentials].filter(([, value]) => value.code === result.code) } };
  } finally { activeStore = previous; }
}

function roomCode() {
  let code = "";
  do { code = Array.from(randomBytes(6), byte => alphabet[byte % alphabet.length]).join(""); } while (store.rooms.has(code));
  return code;
}
function defaultObjective(team: Team, ability: Ability) {
  if (team === "Neutral") return "Follow the custom rule agreed by your group.";
  if (team === "Mafia") return "Work with the Mafia to outnumber the Town.";
  if (ability === "protect") return "Protect someone each night. Help the Town find the Mafia.";
  if (ability === "inspect") return "Inspect someone each night. Help the Town find the Mafia.";
  return "Discuss, vote, and find every Mafia player.";
}
function roleOf(room: Room, player: Player) { return room.roles.find(role => role.id === player.roleId) ?? null; }
function activePlayers(room: Room) { return room.players.filter(player => !player.spectator); }
function livingPlayers(room: Room) { return room.players.filter(player => player.alive && !player.spectator); }
function requireRoom(code: string) {
  const room = store.rooms.get(code.trim().toUpperCase());
  if (!room) fail("Room not found. It may have been deleted.", 404);
  normalizeRoom(room);
  if (Date.now() >= room.expiresAt) fail("This room expired after 24 hours.", 410);
  return room;
}
function access(code: string, credentialValue: string | null) {
  const room = requireRoom(code);
  const credential = credentialValue ? store.credentials.get(tokenHash(credentialValue)) : null;
  if (!credential || credential.code !== room.code) fail("Your room access is missing. Rejoin or request recovery.", 401);
  return { room, credential };
}
export function assertHost(code: string, credentialValue: string | null) {
  const { room, credential } = access(code, credentialValue);
  if (!credential.host) fail("Only the host can do that.", 403);
  return { code: room.code };
}

export function createRoom(nameValue: unknown, capacityValue: unknown): Session {
  const name = cleanName(nameValue);
  const capacity = Number(capacityValue);
  if (!name) fail("Enter your name.");
  if (!Number.isInteger(capacity) || capacity < 4 || capacity > 16) fail("Rooms need 4 to 16 players.");
  const code = roomCode();
  const credential = token();
  const now = Date.now();
  const room: Room = {
    code, hostName: name, capacity, phase: "lobby", round: 1, players: [],
    roles: [
      { id: "mafia", name: "Mafia", team: "Mafia", ability: "night_vote", count: 1, objective: defaultObjective("Mafia", "night_vote") },
      { id: "town", name: "Villager", team: "Town", ability: "none", count: capacity - 3, objective: defaultObjective("Town", "none") },
      { id: "doctor", name: "Doctor", team: "Town", ability: "protect", count: 1, objective: defaultObjective("Town", "protect") },
      { id: "detective", name: "Detective", team: "Town", ability: "inspect", count: 1, objective: defaultObjective("Town", "inspect") }
    ],
    settings: { ...defaultSettings }, announcement: null, winner: null,
    revision: 1, createdAt: now, expiresAt: now + ROOM_LIFETIME_MS,
    phaseEndsAt: null, paused: false, remainingMs: null,
    nightActions: {}, inspectionResults: {}, votes: {}, voteRound: 1, tieNotice: false, readyIds: []
  };
  store.rooms.set(code, room);
  store.credentials.set(tokenHash(credential), { code, playerId: null, host: true });
  return { code, token: credential, playerId: "host" };
}

export function joinRoom(codeValue: unknown, nameValue: unknown, reclaim = false): Session {
  const code = String(codeValue ?? "").trim().toUpperCase();
  const name = cleanName(nameValue);
  if (!name) fail("Enter your name.");
  const room = requireRoom(code);
  const existing = room.players.find(player => player.name === name);
  if (existing) {
    if (!reclaim) fail("That name is already in this room. Continue with your saved access or request host approval.", 409);
    const credential = token();
    store.credentials.set(tokenHash(credential), { code, playerId: existing.id, host: false, pending: true, requestedAt: Date.now() });
    room.revision++;
    return { code, token: credential, playerId: existing.id, pending: true };
  }
  if (reclaim) fail("That player name is not in this room.", 404);
  const spectator = room.phase !== "lobby";
  if (spectator && !room.settings.spectatorJoin) fail("This game has started. Spectator joining is off.", 409);
  if (!spectator && activePlayers(room).length >= room.capacity) fail("This room is full.", 409);
  if (spectator && room.players.length >= 32) fail("This room has reached its spectator limit.", 409);
  const playerId = token();
  const credential = token();
  room.players.push({ id: playerId, name, roleId: null, alive: !spectator, spectator });
  room.revision++;
  store.credentials.set(tokenHash(credential), { code, playerId, host: false });
  return { code, token: credential, playerId };
}

function publicAnnouncement(room: Room, host: boolean) {
  if (!room.announcement) return null;
  const reveal = host || room.settings.revealRoles === "immediate" || (room.settings.revealRoles === "game_end" && room.phase === "game_over");
  return { kind: room.announcement.kind, noElimination: room.announcement.noElimination,
    eliminations: room.announcement.eliminations.map(item => ({ playerId: item.playerId, playerName: item.playerName, ...(reveal ? { roleName: item.roleName } : {}) })) };
}
export function getRoomView(code: string, credentialValue: string | null) {
  const { room, credential } = access(code, credentialValue);
  const viewer = credential.host ? null : room.players.find(player => player.id === credential.playerId);
  if (!credential.host && !viewer) fail("You are no longer in this room.", 403);
  if (credential.pending) return { code: room.code, pending: true, expiresAt: room.expiresAt, viewer: { id: viewer!.id, name: viewer!.name, host: false } };
  const ownRole = viewer && room.phase !== "lobby" ? roleOf(room, viewer) : null;
  const inspection = viewer ? room.inspectionResults[viewer.id] : null;
  const hostState = credential.host ? {
    nightActions: room.nightActions,
    inspections: room.inspectionResults,
    votesSubmitted: Object.keys(room.votes),
    voteCounts: room.phase === "voting" ? null : countTargets(room.votes),
    pendingReclaims: [...store.credentials].filter(([, value]) => value.code === room.code && value.pending).map(([id, value]) => ({ id, playerId: value.playerId, name: room.players.find(player => player.id === value.playerId)?.name ?? "Unknown" }))
  } : undefined;
  return {
    code: room.code, capacity: room.capacity, phase: room.phase, round: room.round, revision: room.revision,
    expiresAt: room.expiresAt, phaseEndsAt: room.phaseEndsAt, paused: room.paused, remainingMs: room.remainingMs,
    voteRound: room.voteRound, tieNotice: room.tieNotice, settings: room.settings,
    players: room.players.map(player => ({ id: player.id, name: player.name, alive: player.alive, spectator: player.spectator,
      ...(credential.host ? { roleId: player.roleId } : room.phase === "game_over" && room.settings.revealRoles === "game_end" ? { roleName: roleOf(room, player)?.name ?? null } : {}) })),
    roles: credential.host ? room.roles : [], announcement: publicAnnouncement(room, credential.host), winner: room.winner,
    readyCount: room.readyIds.length, hostState,
    viewer: { id: viewer?.id ?? "host", name: viewer?.name ?? room.hostName, alive: viewer?.alive ?? true,
      spectator: viewer?.spectator ?? false, host: credential.host, role: ownRole,
      ready: viewer ? room.readyIds.includes(viewer.id) : false,
      eligibleNightTargetIds: viewer ? livingPlayers(room).filter(target =>
        (roleOf(room, viewer)?.ability === "protect" || target.id !== viewer.id) &&
        (roleOf(room, viewer)?.ability !== "night_vote" || roleOf(room, target)?.team !== "Mafia")
      ).map(target => target.id) : [],
      nightActionTargetId: viewer ? room.nightActions[viewer.id] ?? null : null,
      voteSubmitted: viewer ? !!room.votes[viewer.id] : false,
      inspectionResult: inspection ? { targetName: room.players.find(player => player.id === inspection.targetId)?.name ?? "Unknown", wasMafia: inspection.wasMafia } : null }
  };
}

function countTargets(actions: Record<string, string>) {
  const counts: Record<string, number> = {};
  Object.values(actions).forEach(id => { counts[id] = (counts[id] ?? 0) + 1; });
  return counts;
}
function checkWinner(room: Room) {
  const living = livingPlayers(room);
  const mafia = living.filter(player => roleOf(room, player)?.team === "Mafia").length;
  const town = living.filter(player => roleOf(room, player)?.team === "Town").length;
  if (mafia === 0 && town > 0) room.winner = "Town";
  else if (mafia > 0 && mafia >= town) room.winner = "Mafia";
  if (room.winner) { room.phase = "game_over"; room.phaseEndsAt = null; room.paused = false; }
}
function startPhase(room: Room, phase: Phase, now = Date.now()) {
  room.phase = phase;
  room.paused = false;
  room.remainingMs = null;
  const seconds = phase === "night" ? room.settings.nightSeconds : phase === "discussion" ? room.settings.discussionSeconds : phase === "voting" ? room.settings.votingSeconds : 0;
  room.phaseEndsAt = seconds ? now + seconds * 1000 : null;
  if (phase === "night") { room.announcement = null; room.nightActions = {}; room.inspectionResults = {}; room.votes = {}; room.voteRound = 1; room.tieNotice = false; }
  if (phase === "voting") { room.votes = {}; room.voteRound = 1; room.tieNotice = false; }
}
function checkedEliminations(room: Room, ids: unknown) {
  if (!Array.isArray(ids) || ids.length > room.players.length || ids.some(id => typeof id !== "string") || new Set(ids).size !== ids.length) fail("Choose each eliminated player once.");
  const players = ids.map(id => livingPlayers(room).find(player => player.id === id));
  if (players.some(player => !player)) fail("Choose living players only.", 404);
  return players as Player[];
}
function applyResult(room: Room, kind: "night" | "vote", players: Player[]) {
  const eliminations = players.map(player => ({ playerId: player.id, playerName: player.name, wasMafia: roleOf(room, player)?.team === "Mafia", roleName: roleOf(room, player)?.name ?? null }));
  players.forEach(player => { player.alive = false; });
  room.announcement = { kind, eliminations, noElimination: eliminations.length === 0 };
  startPhase(room, kind === "night" ? "morning" : "result");
  if (players.length) checkWinner(room);
}
function resolveNight(room: Room, overrideIds?: unknown) {
  let selected: Player[];
  if (overrideIds !== undefined) selected = checkedEliminations(room, overrideIds);
  else {
    const mafiaVotes: Record<string, string> = {};
    for (const actor of livingPlayers(room)) if (roleOf(room, actor)?.ability === "night_vote") {
      const target = room.nightActions[actor.id];
      if (target) mafiaVotes[actor.id] = target;
    }
    const counts = countTargets(mafiaVotes);
    const ordered = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const targetId = ordered.length && (ordered.length === 1 || ordered[0][1] > ordered[1][1]) ? ordered[0][0] : null;
    const protectedIds = livingPlayers(room).filter(player => roleOf(room, player)?.ability === "protect").map(player => room.nightActions[player.id]);
    selected = targetId && !protectedIds.includes(targetId) ? checkedEliminations(room, [targetId]) : [];
  }
  for (const actor of livingPlayers(room)) if (roleOf(room, actor)?.ability === "inspect") {
    const targetId = room.nightActions[actor.id];
    const target = room.players.find(player => player.id === targetId);
    if (target) room.inspectionResults[actor.id] = { targetId, wasMafia: roleOf(room, target)?.team === "Mafia" };
  }
  applyResult(room, "night", selected);
}
function resolveVote(room: Room, overrideIds?: unknown) {
  if (overrideIds !== undefined) {
    const selected = checkedEliminations(room, overrideIds);
    if (!selected.length && room.settings.tieRule === "revote") return revote(room);
    applyResult(room, "vote", selected);
    return;
  }
  const counts = countTargets(room.votes);
  const ordered = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const tied = ordered.length > 1 && ordered[0][1] === ordered[1][1];
  if (tied && room.settings.tieRule === "revote") return revote(room);
  const winnerId = ordered.length && !tied ? ordered[0][0] : null;
  applyResult(room, "vote", winnerId ? checkedEliminations(room, [winnerId]) : []);
}
function revote(room: Room) {
  room.votes = {};
  room.voteRound++;
  room.tieNotice = true;
  room.phaseEndsAt = Date.now() + room.settings.votingSeconds * 1000;
}
function requiredNightActors(room: Room) { return livingPlayers(room).filter(player => roleOf(room, player)?.ability !== "none"); }

export function tickRoom(code: string, now = Date.now()) {
  const room = requireRoom(code);
  if (room.paused || !room.settings.autoAdvance) return { code: room.code, changed: false };
  const deviceMode = room.settings.actionMode === "device";
  const expired = room.phaseEndsAt !== null && now >= room.phaseEndsAt;
  const allActions = deviceMode && room.phase === "night" && requiredNightActors(room).every(player => !!room.nightActions[player.id]);
  const allVotes = deviceMode && room.phase === "voting" && livingPlayers(room).every(player => !!room.votes[player.id]);
  if (room.phase === "discussion" && expired) startPhase(room, "voting", now);
  else if (deviceMode && room.phase === "night" && (expired || allActions)) resolveNight(room);
  else if (deviceMode && room.phase === "voting" && (expired || allVotes)) resolveVote(room);
  else return { code: room.code, changed: false };
  room.revision++;
  return { code: room.code, changed: true };
}

function setAction(room: Room, actorId: string, targetId: string) {
  const actor = livingPlayers(room).find(player => player.id === actorId);
  const target = livingPlayers(room).find(player => player.id === targetId);
  if (!actor || !target) fail("Choose living players for this action.", 404);
  const ability = roleOf(room, actor)?.ability ?? "none";
  if (ability === "none") fail("This player has no night action.", 409);
  if (ability === "night_vote" && roleOf(room, target)?.team === "Mafia") fail("Mafia cannot target another Mafia player.");
  if (ability === "inspect" && actor.id === target.id) fail("Detective must inspect another player.");
  room.nightActions[actor.id] = target.id;
}
function validateSettings(value: unknown, room: Room): Settings {
  if (!value || typeof value !== "object") fail("Check the room settings.");
  const input = value as Record<string, unknown>;
  const capacity = Number(input.capacity ?? room.capacity);
  if (!Number.isInteger(capacity) || capacity < 4 || capacity > 16 || capacity < activePlayers(room).length) fail("Player limit must be 4–16 and cannot be below joined players.");
  const duration = (key: string) => {
    const number = Number(input[key]);
    if (!Number.isInteger(number) || number < 30 || number > 1800) fail("Timers must be between 30 seconds and 30 minutes.");
    return number;
  };
  if (!["immediate", "game_end", "never"].includes(String(input.revealRoles)) || !["none", "revote"].includes(String(input.tieRule)) || !["guided", "device"].includes(String(input.actionMode)) || typeof input.autoAdvance !== "boolean" || typeof input.spectatorJoin !== "boolean") fail("Check the room settings.");
  room.capacity = capacity;
  return { nightSeconds: duration("nightSeconds"), discussionSeconds: duration("discussionSeconds"), votingSeconds: duration("votingSeconds"), revealRoles: input.revealRoles as RevealRule, tieRule: input.tieRule as TieRule, actionMode: input.actionMode as ActionMode, autoAdvance: input.autoAdvance as boolean, spectatorJoin: input.spectatorJoin as boolean };
}

export function changeRoom(code: string, credentialValue: string | null, input: Record<string, unknown>) {
  const { room, credential } = access(code, credentialValue);
  const action = input.action;
  if (credential.pending) fail("Wait for the host to approve your return.", 403);
  if (action === "ready" || action === "night_action" || action === "vote") {
    if (credential.host) fail("The host does not hold a player role.", 403);
    const player = room.players.find(item => item.id === credential.playerId)!;
    if (player.spectator || !player.alive) fail("Spectators cannot act or vote.", 403);
    if (action === "ready") {
      if (room.phase !== "reveal") fail("Roles are not being revealed now.", 409);
      if (!room.readyIds.includes(player.id)) room.readyIds.push(player.id);
    } else if (action === "night_action") {
      if (room.settings.actionMode !== "device" || room.phase !== "night") fail("Night actions are being guided by the host.", 409);
      setAction(room, player.id, String(input.targetId ?? ""));
    } else {
      if (room.settings.actionMode !== "device" || room.phase !== "voting") fail("The host is coordinating votes.", 409);
      if (room.votes[player.id]) fail("Your vote is already submitted.", 409);
      const target = livingPlayers(room).find(item => item.id === input.targetId);
      if (!target || target.id === player.id) fail("Vote for another living player.");
      room.votes[player.id] = target.id;
    }
  } else {
    if (!credential.host) fail("Only the host can change the game.", 403);
    if (action === "settings") {
      if (room.phase !== "lobby") fail("Room settings can be changed in the waiting room.", 409);
      room.settings = validateSettings(input.settings, room);
    } else if (action === "roles") {
      if (room.phase !== "lobby") fail("Roles can only be edited in the waiting room.", 409);
      if (!Array.isArray(input.roles) || input.roles.length < 2 || input.roles.length > 16) fail("Add between 2 and 16 roles.");
      const roles = input.roles as Role[];
      if (roles.some(role => !role || typeof role.id !== "string" || role.id.length > 80 || !cleanName(role.name) || !["Mafia", "Town", "Neutral"].includes(role.team) || !["night_vote", "protect", "inspect", "none"].includes(role.ability) || !Number.isInteger(role.count) || role.count < 0 || role.count > 16 || typeof role.objective !== "string" || role.objective.length > 180)) fail("Check each role name, team, ability, quantity, and objective.");
      if (new Set(roles.map(role => role.id)).size !== roles.length) fail("Role IDs must be unique.");
      if (!roles.some(role => role.team === "Mafia" && role.count > 0) || !roles.some(role => role.team === "Town" && role.count > 0)) fail("Include at least one Mafia and one Town role.");
      room.roles = roles.map(role => ({ id: role.id, name: cleanName(role.name), team: role.team, ability: role.ability, count: role.count, objective: role.objective.trim() || defaultObjective(role.team, role.ability) }));
      room.players.forEach(player => { if (!room.roles.some(role => role.id === player.roleId)) player.roleId = null; });
    } else if (action === "assign") {
      if (room.phase !== "lobby") fail("Assign roles in the waiting room.", 409);
      const player = activePlayers(room).find(item => item.id === input.playerId);
      if (!player) fail("Player not found.", 404);
      const roleId = input.roleId === null ? null : String(input.roleId ?? "");
      if (roleId !== null && !room.roles.some(role => role.id === roleId)) fail("Role not found.", 404);
      player.roleId = roleId;
    } else if (action === "remove") {
      if (room.phase !== "lobby") fail("Remove players in the waiting room.", 409);
      const playerId = String(input.playerId ?? "");
      if (!room.players.some(player => player.id === playerId)) fail("Player not found.", 404);
      room.players = room.players.filter(player => player.id !== playerId);
      for (const [key, value] of store.credentials) if (value.code === room.code && value.playerId === playerId) store.credentials.delete(key);
    } else if (action === "promote") {
      if (room.phase !== "lobby") fail("Promote spectators in the waiting room.", 409);
      if (activePlayers(room).length >= room.capacity) fail("Increase the player limit first.", 409);
      const player = room.players.find(item => item.id === input.playerId && item.spectator);
      if (!player) fail("Spectator not found.", 404);
      player.spectator = false; player.alive = true;
    } else if (action === "shuffle") {
      if (room.phase !== "lobby") fail("Assign roles in the waiting room.", 409);
      const ids = room.roles.flatMap(role => Array<string>(role.count).fill(role.id));
      const players = activePlayers(room);
      if (ids.length !== players.length) fail("Role quantities must match the joined player count.");
      for (let i = ids.length - 1; i > 0; i--) { const j = randomBytes(1)[0] % (i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
      players.forEach((player, index) => { player.roleId = ids[index]; });
    } else if (action === "reveal") {
      if (room.phase !== "lobby") fail("The game has already started.", 409);
      const players = activePlayers(room);
      if (players.length < 4) fail("Wait for at least four players.", 409);
      if (room.roles.reduce((sum, role) => sum + role.count, 0) !== players.length) fail("Role quantities must match the joined player count.", 409);
      if (room.roles.some(role => players.filter(player => player.roleId === role.id).length !== role.count)) fail("Assign every role before revealing.", 409);
      const mafia = players.filter(player => roleOf(room, player)?.team === "Mafia").length;
      const town = players.filter(player => roleOf(room, player)?.team === "Town").length;
      if (mafia >= town) fail("Town must outnumber Mafia when the game starts.", 409);
      room.readyIds = [];
      startPhase(room, "reveal");
    } else if (action === "advance") {
      const next: Partial<Record<Phase, Phase>> = { reveal: "night", morning: "discussion", discussion: "voting", result: "night" };
      const phase = next[room.phase];
      if (!phase) fail("Resolve this phase before advancing.", 409);
      if (room.phase === "result") room.round++;
      startPhase(room, phase);
    } else if (action === "record_action") {
      if (room.phase !== "night") fail("Record night actions during the night.", 409);
      setAction(room, String(input.actorId ?? ""), String(input.targetId ?? ""));
    } else if (action === "resolve") {
      if (input.kind === "night" && room.phase === "night") resolveNight(room, input.playerIds);
      else if (input.kind === "vote" && room.phase === "voting") resolveVote(room, input.playerIds);
      else fail("This result does not match the current phase.", 409);
    } else if (action === "pause") {
      if (!room.phaseEndsAt || room.paused) fail("This timer cannot be paused now.", 409);
      room.remainingMs = Math.max(0, room.phaseEndsAt - Date.now()); room.phaseEndsAt = null; room.paused = true;
    } else if (action === "resume") {
      if (!room.paused) fail("The timer is not paused.", 409);
      room.phaseEndsAt = Date.now() + (room.remainingMs ?? 0); room.remainingMs = null; room.paused = false;
    } else if (action === "extend") {
      if (!(["night", "discussion", "voting"] as Phase[]).includes(room.phase)) fail("There is no timer in this phase.", 409);
      const seconds = Number(input.seconds);
      if (!Number.isInteger(seconds) || seconds < 15 || seconds > 300) fail("Extend by 15–300 seconds.");
      if (room.paused) room.remainingMs = (room.remainingMs ?? 0) + seconds * 1000;
      else room.phaseEndsAt = Math.max(Date.now(), room.phaseEndsAt ?? Date.now()) + seconds * 1000;
    } else if (action === "approve_reclaim" || action === "reject_reclaim") {
      const id = String(input.claimId ?? "");
      const pending = store.credentials.get(id);
      if (!pending?.pending || pending.code !== room.code) fail("Recovery request not found.", 404);
      if (action === "approve_reclaim") {
        for (const [key, value] of store.credentials) if (key !== id && value.code === room.code && value.playerId === pending.playerId) store.credentials.delete(key);
        pending.pending = false; delete pending.requestedAt;
      } else store.credentials.delete(id);
    } else if (action === "end") {
      if (room.phase === "lobby") fail("The game has not started.", 409);
      const winnerRole = room.roles.find(role => role.id === input.winnerRoleId);
      if (input.winnerRoleId && (!winnerRole || winnerRole.team !== "Neutral" || winnerRole.count === 0)) fail("Choose an active custom Neutral role.");
      room.winner = winnerRole?.name ?? null;
      room.phase = "game_over"; room.phaseEndsAt = null;
    } else if (action === "play_again") {
      if (room.phase !== "game_over") fail("Finish the current game first.", 409);
      room.players.forEach(player => { player.roleId = null; player.alive = !player.spectator; });
      room.phase = "lobby"; room.round = 1; room.announcement = null; room.winner = null;
      room.phaseEndsAt = null; room.remainingMs = null; room.paused = false;
      room.nightActions = {}; room.inspectionResults = {}; room.votes = {}; room.voteRound = 1; room.tieNotice = false; room.readyIds = [];
    } else fail("Unknown action.");
  }
  room.revision++;
  if (room.settings.autoAdvance && room.settings.actionMode === "device") tickRoom(room.code);
  return getRoomView(room.code, credentialValue);
}
