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

type RoleDeckCounts = { mafia: number; doctor: number; detective: number; playerCount: number; customTownCount?: number };

export function roleDeckError(counts: RoleDeckCounts): string | null {
  const customTownCount = counts.customTownCount ?? 0;
  if (counts.playerCount < 4) return "Add at least 4 players to begin.";
  if (counts.mafia < 1 || counts.doctor < 0 || counts.detective < 0 || customTownCount < 0) return "Role counts cannot be negative, and you need at least 1 Mafia.";
  if (counts.mafia >= counts.playerCount - counts.mafia) {
    const needed = counts.mafia * 2 + 1;
    return needed > 16
      ? `${counts.mafia} Mafia needs ${needed} players. Choose fewer Mafia; the table holds up to 16 players.`
      : `Add at least ${needed} players for ${counts.mafia} Mafia so Town outnumbers Mafia.`;
  }
  const requiredCards = counts.mafia + counts.doctor + counts.detective + customTownCount;
  if (requiredCards >= counts.playerCount) {
    const needed = requiredCards + 1;
    return needed > 16
      ? "Choose fewer role cards so at least one Villager remains."
      : `Add at least ${needed} players or choose fewer role cards so at least one Villager remains.`;
  }
  return null;
}

export function roleDeck(counts: RoleDeckCounts) {
  const customTownCount = counts.customTownCount ?? 0;
  const specialCount = counts.mafia + counts.doctor + counts.detective + customTownCount;
  if (roleDeckError(counts)) return null;
  return [
    ...Array<PassPlayRole>(counts.mafia).fill("Mafia"),
    ...Array<PassPlayRole>(counts.doctor).fill("Doctor"),
    ...Array<PassPlayRole>(counts.detective).fill("Detective"),
    ...Array<PassPlayRole>(counts.playerCount - specialCount).fill("Villager")
  ];
}
