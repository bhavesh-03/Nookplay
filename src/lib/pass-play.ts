export type PassPlayRole = "Mafia" | "Villager" | "Doctor" | "Detective";
export type PassPlayPlayer = { id: string; name: string; role: string; alive: boolean };

export function livingPassPlayPlayers(players: PassPlayPlayer[]) {
  return players.filter(player => player.alive);
}

export function eliminatePassPlayPlayer(players: PassPlayPlayer[], playerId: string | null) {
  if (!playerId) return players;
  return players.map(player => player.id === playerId ? { ...player, alive: false } : player);
}

export function passPlayWinner(players: PassPlayPlayer[]): "Mafia" | "Town" | null {
  const living = livingPassPlayPlayers(players);
  const mafia = living.filter(player => player.role === "Mafia").length;
  const town = living.length - mafia;
  if (mafia === 0) return "Town";
  if (mafia >= town) return "Mafia";
  return null;
}

export function roleDeck(counts: { mafia: number; doctor: number; detective: number; playerCount: number; customTownCount?: number }) {
  const customTownCount = counts.customTownCount ?? 0;
  const specialCount = counts.mafia + counts.doctor + counts.detective + customTownCount;
  const townCount = counts.playerCount - counts.mafia;
  if (
    counts.playerCount < 4 ||
    counts.mafia < 1 ||
    counts.doctor < 0 ||
    counts.detective < 0 ||
    specialCount >= counts.playerCount ||
    counts.mafia >= townCount
  ) return null;
  return [
    ...Array<PassPlayRole>(counts.mafia).fill("Mafia"),
    ...Array<PassPlayRole>(counts.doctor).fill("Doctor"),
    ...Array<PassPlayRole>(counts.detective).fill("Detective"),
    ...Array<PassPlayRole>(counts.playerCount - specialCount).fill("Villager")
  ];
}
