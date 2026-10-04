import assert from "node:assert/strict";
import { test } from "node:test";
import { changeRoom, createRoom, getRoomView, joinRoom, runWithState, tickRoom } from "../src/lib/game.ts";

function setup(names = ["Alice", "Bob", "Cara", "Dan"]) {
  const host = createRoom("Host", names.length);
  const guests = names.map(name => joinRoom(host.code, name));
  const players = getRoomView(host.code, host.token).players;
  const roles = names.length === 4 ? ["mafia", "town", "doctor", "detective"] : ["mafia", ...Array(names.length - 3).fill("town"), "doctor", "detective"];
  players.forEach((player, index) => changeRoom(host.code, host.token, { action: "assign", playerId: player.id, roleId: roles[index] }));
  changeRoom(host.code, host.token, { action: "reveal" });
  return { host, guests, players };
}
const act = (host, action, extra = {}) => changeRoom(host.code, host.token, { action, ...extra });

test("private reveal, uppercase names, host roster, guided round two and replay", () => {
  const { host, guests, players } = setup(["Alice", "Bob", "Cara", "Dan", "Eve"]);
  const playerView = getRoomView(host.code, guests[1].token);
  assert.equal(playerView.viewer.name, "BOB");
  assert.equal(playerView.viewer.role?.name, "Villager");
  assert.equal(playerView.roles.length, 0);
  assert.equal(playerView.players.some(player => "roleId" in player), false);
  assert.equal(getRoomView(host.code, host.token).players[0].roleId, "mafia");
  assert.throws(() => changeRoom(host.code, guests[1].token, { action: "advance" }), /Only the host/);
  act(host, "advance");
  assert.throws(() => act(host, "resolve", { kind: "night", playerIds: [players[1].id, players[1].id] }), /each eliminated player once/);
  const morning = act(host, "resolve", { kind: "night", playerIds: [players[1].id, players[2].id] });
  assert.equal(morning.phase, "morning");
  assert.equal(morning.players.filter(player => !player.alive).length, 2);
  assert.equal(getRoomView(host.code, guests[3].token).announcement.eliminations[0].roleName, undefined);
  assert.throws(() => changeRoom(host.code, guests[1].token, { action: "vote", targetId: players[0].id }), /Spectators/);
  act(host, "advance"); act(host, "advance");
  const result = act(host, "resolve", { kind: "vote", playerIds: [] });
  assert.equal(result.phase, "result");
  const next = act(host, "advance");
  assert.equal(next.round, 2);
  assert.equal(next.phase, "night");
  assert.equal(next.announcement, null);
  const won = act(host, "resolve", { kind: "night", playerIds: [players[0].id] });
  assert.equal(won.phase, "game_over");
  assert.equal(won.winner, "Town");
  const replay = act(host, "play_again");
  assert.equal(replay.phase, "lobby");
  assert.equal(replay.round, 1);
  assert.ok(replay.players.every(player => player.alive && player.roleId === null));
});

test("device mode applies doctor protection and hides vote choices", () => {
  const host = createRoom("Host", 4);
  act(host, "settings", { settings: { ...getRoomView(host.code, host.token).settings, actionMode: "device", capacity: 4 } });
  const guests = ["A", "B", "C", "D"].map(name => joinRoom(host.code, name));
  const players = getRoomView(host.code, host.token).players;
  ["mafia", "town", "doctor", "detective"].forEach((roleId, i) => act(host, "assign", { playerId: players[i].id, roleId }));
  act(host, "reveal"); act(host, "advance");
  assert.ok(!getRoomView(host.code, guests[0].token).viewer.eligibleNightTargetIds.includes(players[0].id));
  assert.ok(getRoomView(host.code, guests[2].token).viewer.eligibleNightTargetIds.includes(players[2].id));
  changeRoom(host.code, guests[0].token, { action: "night_action", targetId: players[1].id });
  changeRoom(host.code, guests[2].token, { action: "night_action", targetId: players[1].id });
  changeRoom(host.code, guests[3].token, { action: "night_action", targetId: players[0].id });
  const morning = act(host, "resolve", { kind: "night" });
  assert.equal(morning.announcement.noElimination, true);
  assert.equal(getRoomView(host.code, guests[3].token).viewer.inspectionResult.wasMafia, true);
  act(host, "advance"); act(host, "advance");
  changeRoom(host.code, guests[1].token, { action: "vote", targetId: players[0].id });
  assert.equal(getRoomView(host.code, guests[2].token).hostState, undefined);
  assert.equal(getRoomView(host.code, host.token).hostState.voteCounts, null);
  assert.throws(() => changeRoom(host.code, guests[1].token, { action: "vote", targetId: players[0].id }), /already submitted/);
});

test("recovery requires host approval and revokes old token", () => {
  const host = createRoom("Host", 4);
  const original = joinRoom(host.code, "Alice");
  assert.throws(() => joinRoom(host.code, "alice"), /already in this room/);
  const pending = joinRoom(host.code, "alice", true);
  assert.equal(getRoomView(host.code, pending.token).pending, true);
  const claim = getRoomView(host.code, host.token).hostState.pendingReclaims[0];
  act(host, "approve_reclaim", { claimId: claim.id });
  assert.equal(getRoomView(host.code, pending.token).viewer.name, "ALICE");
  assert.throws(() => getRoomView(host.code, original.token), /access is missing/);
});

test("roles reveal at game end only when selected, and a custom Joker can win", () => {
  const host = createRoom("Host", 5);
  act(host, "settings", { settings: { ...getRoomView(host.code, host.token).settings, capacity: 5, revealRoles: "game_end" } });
  const guests = ["A", "B", "C", "D", "E"].map(name => joinRoom(host.code, name));
  const players = getRoomView(host.code, host.token).players;
  act(host, "roles", { roles: [
    { id: "mafia", name: "MAFIA", team: "Mafia", ability: "night_vote", count: 1, objective: "Win with Mafia" },
    { id: "town", name: "VILLAGER", team: "Town", ability: "none", count: 3, objective: "Find Mafia" },
    { id: "joker", name: "JOKER", team: "Neutral", ability: "none", count: 1, objective: "Follow the group rule" }
  ] });
  ["mafia", "town", "town", "town", "joker"].forEach((roleId, i) => act(host, "assign", { playerId: players[i].id, roleId }));
  act(host, "reveal"); act(host, "advance");
  act(host, "resolve", { kind: "night", playerIds: [players[1].id] });
  assert.equal(getRoomView(host.code, guests[2].token).announcement.eliminations[0].roleName, undefined);
  assert.equal(getRoomView(host.code, guests[2].token).players[0].roleName, undefined);
  assert.throws(() => act(host, "end", { winnerRoleId: "mafia" }), /Neutral/);
  const ended = act(host, "end", { winnerRoleId: "joker" });
  assert.equal(ended.winner, "JOKER");
  assert.equal(getRoomView(host.code, guests[2].token).players[0].roleName, "MAFIA");
  assert.equal(getRoomView(host.code, guests[2].token).announcement.eliminations[0].roleName, "VILLAGER");
});

test("room state survives serialization without raw tokens and expires after 24 hours", () => {
  const created = runWithState(null, () => createRoom("Admin", 4));
  assert.equal(JSON.stringify(created.state).includes(created.result.token), false);
  const joined = runWithState(structuredClone(created.state), () => joinRoom(created.result.code, "Player"));
  assert.equal(JSON.stringify(joined.state).includes(joined.result.token), false);
  assert.equal(runWithState(structuredClone(joined.state), () => getRoomView(joined.result.code, joined.result.token)).result.viewer.name, "PLAYER");
  const expired = structuredClone(joined.state);
  expired.room.expiresAt = Date.now() - 1;
  assert.throws(() => runWithState(expired, () => getRoomView(joined.result.code, joined.result.token)), /expired/);
});

test("automatic timers move discussion to voting and tied device vote can revote", () => {
  const host = createRoom("Host", 4);
  act(host, "settings", { settings: { ...getRoomView(host.code, host.token).settings, capacity: 4, actionMode: "device", tieRule: "revote", autoAdvance: true } });
  const guests = ["A", "B", "C", "D"].map(name => joinRoom(host.code, name));
  const players = getRoomView(host.code, host.token).players;
  ["mafia", "town", "doctor", "detective"].forEach((roleId, i) => act(host, "assign", { playerId: players[i].id, roleId }));
  act(host, "reveal"); act(host, "advance");
  act(host, "resolve", { kind: "night", playerIds: [] }); act(host, "advance");
  const before = getRoomView(host.code, host.token);
  assert.equal(before.phase, "discussion");
  tickRoom(host.code, before.phaseEndsAt + 1);
  assert.equal(getRoomView(host.code, host.token).phase, "voting");
  changeRoom(host.code, guests[0].token, { action: "vote", targetId: players[1].id });
  changeRoom(host.code, guests[1].token, { action: "vote", targetId: players[0].id });
  changeRoom(host.code, guests[2].token, { action: "vote", targetId: players[1].id });
  changeRoom(host.code, guests[3].token, { action: "vote", targetId: players[0].id });
  const tied = getRoomView(host.code, host.token);
  assert.equal(tied.phase, "voting");
  assert.equal(tied.voteRound, 2);
  assert.equal(tied.tieNotice, true);
});
