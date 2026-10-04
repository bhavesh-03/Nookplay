import assert from "node:assert/strict";
import { test } from "node:test";
import { eliminatePassPlayPlayer, livingPassPlayPlayers, passPlayWinner, roleDeck } from "../src/lib/pass-play.ts";

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
  assert.equal(roleDeck({ mafia: 3, doctor: 1, detective: 1, playerCount: 5 }), null);
});
