import { createHash, randomBytes } from "node:crypto";

export type Team = "Mafia" | "Town";
export type Ability = "night_vote" | "inspect" | "protect" | "none";
export type Phase = "lobby" | "reveal" | "night" | "morning" | "discussion" | "voting" | "result" | "game_over";
export type Role = { id: string; name: string; team: Team; ability: Ability; count: number };
export type Player = { id: string; name: string; roleId: string | null; alive: boolean };
export type Announcement = { playerId: string | null; playerName: string | null; wasMafia: boolean | null; kind: "night" | "vote"; noElimination: boolean };
export type Room = { code: string; hostName: string; capacity: number; phase: Phase; round: number; players: Player[]; roles: Role[]; announcement: Announcement | null; winner: Team | null; revision: number; createdAt: number };
type Credential = { code: string; playerId: string | null; host: boolean };
type GameStore = { rooms: Map<string, Room>; credentials: Map<string, Credential> };
export type StoredRoom = { room: Room; credentials: Array<[string, Credential]> };

declare global { var nookplayStore: GameStore | undefined; }
const localStore: GameStore = globalThis.nookplayStore ??= { rooms: new Map<string, Room>(), credentials: new Map<string, Credential>() };
let activeStore: GameStore | null = null;
const store = {
  get rooms() { return (activeStore ?? localStore).rooms; },
  get credentials() { return (activeStore ?? localStore).credentials; }
};
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function token() { return randomBytes(32).toString("hex"); }
function tokenHash(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function runWithState<T extends { code: string }>(state: StoredRoom | null, operation: () => T): { result: T; state: StoredRoom } {
  const previous = activeStore;
  const current: GameStore = {
    rooms: new Map(state ? [[state.room.code, state.room]] : []),
    credentials: new Map(state?.credentials ?? [])
  };
  activeStore = current;
  try {
    const result = operation();
    const room = current.rooms.get(result.code);
    if (!room) throw new GameError("Room state is missing.", 500);
    return { result, state: { room, credentials: [...current.credentials].filter(([, value]) => value.code === result.code) } };
  } finally { activeStore = previous; }
}
function roomCode() {
  let code = "";
  do { code = Array.from(randomBytes(6), byte => alphabet[byte % alphabet.length]).join(""); } while (store.rooms.has(code));
  return code;
}
function cleanName(value: unknown) { return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 22) : ""; }
function fail(message: string, status = 400): never { throw new GameError(message, status); }
export class GameError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }

export function createRoom(nameValue: unknown, capacityValue: unknown) {
  const name = cleanName(nameValue);
  const capacity = Number(capacityValue);
  if (!name) fail("Enter your name.");
  if (!Number.isInteger(capacity) || capacity < 4 || capacity > 16) fail("Rooms need 4 to 16 players.");
  const code = roomCode();
  const credential = token();
  const room: Room = {
    code, hostName: name, capacity, phase: "lobby", round: 1,
    players: [],
    roles: [
      { id: "mafia", name: "Thief", team: "Mafia", ability: "night_vote", count: 1 },
      { id: "town", name: "Villager", team: "Town", ability: "none", count: Math.max(2, capacity - 2) },
      { id: "detective", name: "Detective", team: "Town", ability: "inspect", count: 1 }
    ],
    announcement: null, winner: null, revision: 1, createdAt: Date.now()
  };
  store.rooms.set(code, room);
  store.credentials.set(tokenHash(credential), { code, playerId: null, host: true });
  return { code, token: credential, playerId: "host" };
}

export function joinRoom(codeValue: unknown, nameValue: unknown) {
  const code = String(codeValue ?? "").trim().toUpperCase();
  const name = cleanName(nameValue);
  if (!name) fail("Enter your name.");
  const room = store.rooms.get(code);
  if (!room) fail("Room not found. Check the code and try again.", 404);
  if (room.phase !== "lobby") fail("This game has already started.", 409);
  if (room.players.length >= room.capacity) fail("This room is full.", 409);
  if (room.players.some(player => player.name.toLowerCase() === name.toLowerCase())) fail("That name is already taken in this room.", 409);
  const playerId = token();
  const credential = token();
  room.players.push({ id: playerId, name, roleId: null, alive: true });
  room.revision++;
  store.credentials.set(tokenHash(credential), { code, playerId, host: false });
  return { code, token: credential, playerId };
}

function access(code: string, credentialValue: string | null) {
  const credential = credentialValue ? store.credentials.get(tokenHash(credentialValue)) : null;
  const room = store.rooms.get(code.toUpperCase());
  if (!room) fail("Room not found. It may have reset when the server restarted.", 404);
  if (!credential || credential.code !== room.code) fail("Your room session is missing. Rejoin the room.", 401);
  return { room, credential };
}

export function getRoomView(code: string, credentialValue: string | null) {
  const { room, credential } = access(code, credentialValue);
  const viewer = credential.host ? null : room.players.find(player => player.id === credential.playerId);
  if (!credential.host && !viewer) fail("You are no longer in this room.", 403);
  const ownRole = room.phase !== "lobby" ? room.roles.find(role => role.id === viewer?.roleId) ?? null : null;
  return {
    code: room.code, capacity: room.capacity, phase: room.phase, round: room.round, revision: room.revision,
    players: room.players.map(player => ({ id: player.id, name: player.name, alive: player.alive, ...(credential.host ? { roleId: player.roleId } : {}) })),
    roles: room.roles, announcement: room.announcement, winner: room.winner,
    viewer: { id: viewer?.id ?? "host", name: viewer?.name ?? room.hostName, alive: viewer?.alive ?? true, host: credential.host, role: ownRole }
  };
}

function checkWinner(room: Room) {
  const living = room.players.filter(player => player.alive);
  const mafia = living.filter(player => room.roles.find(role => role.id === player.roleId)?.team === "Mafia").length;
  const town = living.length - mafia;
  room.winner = mafia === 0 ? "Town" : mafia >= town ? "Mafia" : null;
  if (room.winner) room.phase = "game_over";
}

export function changeRoom(code: string, credentialValue: string | null, input: Record<string, unknown>) {
  const { room, credential } = access(code, credentialValue);
  if (!credential.host) fail("Only the host can change the game.", 403);
  const action = input.action;
  if (action === "roles") {
    if (room.phase !== "lobby") fail("Roles can only be edited in the lobby.", 409);
    if (!Array.isArray(input.roles) || input.roles.length < 2 || input.roles.length > 16) fail("Add between 2 and 16 roles.");
    const roles = input.roles as Role[];
    if (roles.some(role => !role || typeof role.id !== "string" || typeof role.name !== "string" || !role.name.trim() || role.name.length > 22 || !["Mafia", "Town"].includes(role.team) || !["night_vote", "inspect", "protect", "none"].includes(role.ability) || !Number.isInteger(role.count) || role.count < 0 || role.count > 16)) fail("Check role names, teams, abilities, and quantities.");
    if (new Set(roles.map(role => role.id)).size !== roles.length) fail("Role IDs must be unique.");
    if (!roles.some(role => role.team === "Mafia" && role.count > 0) || !roles.some(role => role.team === "Town" && role.count > 0)) fail("Include at least one Mafia and one Town role.");
    room.roles = roles.map(role => ({ id: role.id, name: role.name.trim(), team: role.team, ability: role.ability, count: role.count }));
    room.players.forEach(player => { if (!room.roles.some(role => role.id === player.roleId)) player.roleId = null; });
  } else if (action === "assign") {
    if (room.phase !== "lobby") fail("Roles can only be assigned in the lobby.", 409);
    const player = room.players.find(item => item.id === input.playerId);
    if (!player) fail("Player not found.", 404);
    const roleId = input.roleId === null ? null : String(input.roleId ?? "");
    if (roleId !== null && !room.roles.some(role => role.id === roleId)) fail("Role not found.", 404);
    player.roleId = roleId;
  } else if (action === "remove") {
    if (room.phase !== "lobby") fail("Players can only be removed in the lobby.", 409);
    const playerId = String(input.playerId ?? "");
    if (!room.players.some(player => player.id === playerId)) fail("Player not found.", 404);
    room.players = room.players.filter(player => player.id !== playerId);
    for (const [key, value] of store.credentials) if (value.code === room.code && value.playerId === playerId) store.credentials.delete(key);
  } else if (action === "shuffle") {
    if (room.phase !== "lobby") fail("Roles can only be assigned in the lobby.", 409);
    const ids = room.roles.flatMap(role => Array<string>(role.count).fill(role.id));
    if (ids.length !== room.players.length) fail("Role quantities must match the joined player count.");
    for (let i = ids.length - 1; i > 0; i--) { const j = randomBytes(1)[0] % (i + 1); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    room.players.forEach((player, i) => { player.roleId = ids[i]; });
  } else if (action === "reveal") {
    if (room.phase !== "lobby") fail("The game has already started.", 409);
    if (room.players.length < 4) fail("Wait for at least 4 players.", 409);
    if (room.roles.reduce((sum, role) => sum + role.count, 0) !== room.players.length) fail("Role quantities must match the joined player count.", 409);
    if (room.roles.some(role => room.players.filter(player => player.roleId === role.id).length !== role.count)) fail("Assign every role before revealing.", 409);
    room.phase = "reveal";
  } else if (action === "advance") {
    const next: Partial<Record<Phase, Phase>> = { reveal: "night", night: "morning", morning: "discussion", discussion: "voting", result: "night" };
    const phase = next[room.phase];
    if (!phase) fail("Resolve this phase before advancing.", 409);
    if (room.phase === "result") room.round++;
    room.phase = phase;
    if (phase === "night") room.announcement = null;
  } else if (action === "resolve") {
    const kind = input.kind;
    if ((kind === "night" && room.phase !== "night") || (kind === "vote" && room.phase !== "voting")) fail("This result does not match the current phase.", 409);
    if (kind !== "night" && kind !== "vote") fail("Choose a night or vote result.");
    const playerId = input.playerId === null ? null : String(input.playerId ?? "");
    const player = playerId ? room.players.find(item => item.id === playerId && item.alive) : null;
    if (playerId && !player) fail("Choose a living player.", 404);
    if (player) player.alive = false;
    const role = player ? room.roles.find(item => item.id === player.roleId) : null;
    room.announcement = { playerId: player?.id ?? null, playerName: player?.name ?? null, wasMafia: role ? role.team === "Mafia" : null, kind, noElimination: !player };
    room.phase = kind === "night" ? "morning" : "result";
    if (player) checkWinner(room);
  } else if (action === "end") {
    if (room.phase === "lobby") fail("The game has not started.", 409);
    room.phase = "game_over";
  } else fail("Unknown host action.");
  room.revision++;
  return getRoomView(room.code, credentialValue);
}
