import assert from "node:assert/strict";
import { test } from "node:test";
import { changeRoom, createRoom, getRoomView, joinRoom, runWithState } from "../src/lib/game.ts";

test("host assigns roles, players see only their own, and a Mafia elimination ends the game", () => {
  const host = createRoom("Host", 4);
  const guests = ["Avery", "Morgan", "Jules", "Casey"].map(name => joinRoom(host.code, name));
  const players = getRoomView(host.code, host.token).players;
  assert.equal(players.length, 4);
  assert.equal(getRoomView(host.code, host.token).viewer.role, null);
  assert.equal(getRoomView(host.code, guests[0].token).players.some(player => "roleId" in player), false);
  assert.throws(() => changeRoom(host.code, guests[0].token, { action: "reveal" }), /Only the host/);

  const roles = ["mafia", "town", "town", "detective"];
  players.forEach((player, index) => changeRoom(host.code, host.token, { action: "assign", playerId: player.id, roleId: roles[index] }));
  changeRoom(host.code, host.token, { action: "reveal" });
  assert.equal(getRoomView(host.code, guests[0].token).viewer.role?.team, "Mafia");
  assert.equal(getRoomView(host.code, guests[1].token).viewer.role?.team, "Town");
  assert.equal(getRoomView(host.code, guests[1].token).players.some(player => "roleId" in player), false);

  changeRoom(host.code, host.token, { action: "advance" });
  changeRoom(host.code, host.token, { action: "resolve", kind: "night", playerId: null });
  changeRoom(host.code, host.token, { action: "advance" });
  changeRoom(host.code, host.token, { action: "advance" });
  const result = changeRoom(host.code, host.token, { action: "resolve", kind: "vote", playerId: players[0].id });
  assert.equal(result.phase, "game_over");
  assert.equal(result.winner, "Town");
  assert.equal(result.announcement?.wasMafia, true);
  assert.equal(result.players[0].alive, false);
  assert.throws(() => changeRoom(host.code, host.token, { action: "resolve", kind: "vote", playerId: players[0].id }), /current phase/);
});

test("room state survives serialization without storing raw access tokens", () => {
  const created = runWithState(null, () => createRoom("Admin", 4));
  assert.equal(JSON.stringify(created.state).includes(created.result.token), false);
  const joined = runWithState(structuredClone(created.state), () => joinRoom(created.result.code, "Player"));
  assert.equal(JSON.stringify(joined.state).includes(joined.result.token), false);
  const playerView = runWithState(structuredClone(joined.state), () => getRoomView(joined.result.code, joined.result.token)).result;
  assert.equal(playerView.viewer.name, "Player");
  assert.equal(playerView.viewer.host, false);
  assert.equal(playerView.players.length, 1);
  const restoredHost = runWithState(structuredClone(joined.state), () => getRoomView(joined.result.code, created.result.token)).result;
  assert.equal(restoredHost.viewer.host, true);
});

test("host can eliminate several players and explicitly start round two", () => {
  const host = createRoom("Host", 6);
  for (const name of ["A", "B", "C", "D", "E", "F"]) joinRoom(host.code, name);
  const players = getRoomView(host.code, host.token).players;
  ["mafia", "town", "town", "town", "town", "detective"].forEach((roleId, index) => {
    changeRoom(host.code, host.token, { action: "assign", playerId: players[index].id, roleId });
  });
  changeRoom(host.code, host.token, { action: "reveal" });
  changeRoom(host.code, host.token, { action: "advance" });
  assert.throws(() => changeRoom(host.code, host.token, { action: "resolve", kind: "night", playerIds: [players[1].id, players[1].id] }), /each eliminated player once/);
  const morning = changeRoom(host.code, host.token, { action: "resolve", kind: "night", playerIds: [players[1].id, players[2].id] });
  assert.equal(morning.phase, "morning");
  assert.deepEqual(morning.announcement.eliminations.map(item => item.playerName), ["B", "C"]);
  assert.equal(morning.players.filter(player => !player.alive).length, 2);
  assert.throws(() => changeRoom(host.code, host.token, { action: "resolve", kind: "night", playerIds: [players[1].id] }), /current phase/);
  changeRoom(host.code, host.token, { action: "advance" });
  changeRoom(host.code, host.token, { action: "advance" });
  const result = changeRoom(host.code, host.token, { action: "resolve", kind: "vote", playerIds: [] });
  assert.equal(result.phase, "result");
  assert.equal(result.announcement.noElimination, true);
  const secondRound = changeRoom(host.code, host.token, { action: "advance" });
  assert.equal(secondRound.round, 2);
  assert.equal(secondRound.phase, "night");
  assert.equal(secondRound.announcement, null);
});
