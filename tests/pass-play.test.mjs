import assert from "node:assert/strict";
import { test } from "node:test";
import { eliminatePassPlayPlayer, livingPassPlayPlayers, passPlayWinner, roleDeck, roleDeckError } from "../src/lib/pass-play.ts";

const players = [
  { id: "mafia", name: "MAFIA", role: "Mafia", alive: true },
  { id: "doctor", name: "DOCTOR", role: "Doctor", alive: true },
  { id: "detective", name: "DETECTIVE", role: "Detective", alive: true },
  { id: "villager", name: "VILLAGER", role: "Villager", alive: true }
];

test("an eliminated Pass & Play player cannot be selected in later phases", () => {
  const afterNight = eliminatePassPlayPlayer(players, "villager");
  assert.deepEqual(livingPassPlayPlayers(afterNight).map(player => player.id), ["mafia", "doctor", "detective"]);
  const afterVote = eliminatePassPlayPlayer(afterNight, "mafia");
  assert.equal(passPlayWinner(afterVote), "Town");
  assert.ok(!livingPassPlayPlayers(afterVote).some(player => player.id === "mafia" || player.id === "villager"));
});

test("role deck preserves every requested role slot", () => {
  assert.deepEqual(roleDeck({ mafia: 1, doctor: 1, detective: 1, playerCount: 5 })?.sort(), ["Detective", "Doctor", "Mafia", "Villager", "Villager"]);
  assert.deepEqual(roleDeck({ mafia: 1, doctor: 1, detective: 1, customTownCount: 2, playerCount: 6 })?.sort(), ["Detective", "Doctor", "Mafia", "Villager"]);
  assert.equal(roleDeck({ mafia: 3, doctor: 1, detective: 1, playerCount: 5 }), null);
});

test("multiple Mafia work when the table has enough Town players", () => {
  const deck = roleDeck({ mafia: 2, doctor: 1, detective: 1, playerCount: 7 });
  assert.equal(deck?.filter(role => role === "Mafia").length, 2);
  assert.equal(deck?.length, 7);
  assert.equal(roleDeckError({ mafia: 2, doctor: 1, detective: 1, playerCount: 7 }), null);
});

test("impossible role combinations explain what needs to change", () => {
  assert.match(roleDeckError({ mafia: 2, doctor: 1, detective: 1, playerCount: 4 }), /at least 5 players/);
  assert.equal(roleDeck({ mafia: 2, doctor: 1, detective: 1, playerCount: 4 }), null);
  assert.match(roleDeckError({ mafia: 2, doctor: 1, detective: 1, customTownCount: 1, playerCount: 5 }), /at least 6 players/);
  assert.match(roleDeckError({ mafia: 8, doctor: 0, detective: 0, playerCount: 16 }), /Choose fewer Mafia/);
});
