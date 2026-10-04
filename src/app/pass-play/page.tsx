"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, HeartPulse, Moon, RotateCcw, Search, Skull, Sun, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Role = "Mafia" | "Villager" | "Doctor" | "Detective";
type Stage = "setup" | "deal" | "night" | "morning" | "discussion" | "vote" | "result" | "gameOver";
type Player = { id: string; name: string; role: Role; alive: boolean };
type NightAction = "Mafia" | "Doctor" | "Detective";

const roleInfo: Record<Role, { team: string; copy: string; icon: typeof Skull; tone: string }> = {
  Mafia: { team: "Mafia", copy: "Choose one Town player to eliminate each night.", icon: Skull, tone: "bg-primary" },
  Villager: { team: "Town", copy: "Find the Mafia through discussion and voting.", icon: Users, tone: "bg-[#8ddcfa]" },
  Doctor: { team: "Town", copy: "Protect one player from the Mafia each night.", icon: HeartPulse, tone: "bg-gold" },
  Detective: { team: "Town", copy: "Inspect one player each night. The narrator tells you if they are Mafia.", icon: Search, tone: "bg-[#b6a6ff]" }
};

const actionCopy: Record<NightAction, { title: string; prompt: string; Icon: typeof Skull }> = {
  Mafia: { title: "Mafia move", prompt: "Call the Mafia. Choose the player they target.", Icon: Skull },
  Doctor: { title: "Doctor move", prompt: "Call the Doctor. Choose the player they protect.", Icon: HeartPulse },
  Detective: { title: "Detective move", prompt: "Call the Detective. Choose who they inspect.", Icon: Search }
};

function cleanName(value: string) { return value.trim().replace(/\s+/g, " ").toUpperCase().slice(0, 22); }
function makeId() { return crypto.randomUUID(); }
function winnerFor(players: Player[]): "Mafia" | "Town" | null {
  const living = players.filter(player => player.alive);
  const mafia = living.filter(player => player.role === "Mafia").length;
  const town = living.length - mafia;
  if (mafia === 0) return "Town";
  if (mafia >= town) return "Mafia";
  return null;
}

export default function PassPlayPage() {
  const [stage, setStage] = useState<Stage>("setup");
  const [draftName, setDraftName] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [dealIndex, setDealIndex] = useState(0);
  const [cardShown, setCardShown] = useState(false);
  const [round, setRound] = useState(1);
  const [nightIndex, setNightIndex] = useState(0);
  const [nightChoices, setNightChoices] = useState<Partial<Record<NightAction, string>>>({});
  const [selection, setSelection] = useState("");
  const [eliminated, setEliminated] = useState<string | null>(null);
  const [winner, setWinner] = useState<"Mafia" | "Town" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const living = players.filter(player => player.alive);
  const actions = useMemo(() => (["Mafia", "Doctor", "Detective"] as NightAction[]).filter(action => players.some(player => player.alive && player.role === action)), [players]);
  const currentAction = actions[nightIndex];
  const dealPlayer = players[dealIndex];

  function addPlayer() {
    const name = cleanName(draftName);
    if (!name || names.includes(name) || names.length >= 16) return;
    setNames(current => [...current, name]);
    setDraftName("");
  }

  function startDeal() {
    const roles: Role[] = ["Mafia", "Doctor", "Detective", ...Array(Math.max(0, names.length - 3)).fill("Villager")];
    for (let index = roles.length - 1; index > 0; index--) {
      const next = Math.floor(Math.random() * (index + 1));
      [roles[index], roles[next]] = [roles[next], roles[index]];
    }
    setPlayers(names.map((name, index) => ({ id: makeId(), name, role: roles[index], alive: true })));
    setDealIndex(0);
    setCardShown(false);
    setStage("deal");
  }

  function showCard() {
    if (timer.current) clearTimeout(timer.current);
    setCardShown(true);
  }

  function nextCard() {
    setCardShown(false);
    if (dealIndex + 1 < players.length) setDealIndex(index => index + 1);
    else { setNightIndex(0); setNightChoices({}); setSelection(""); setStage("night"); }
  }

  function chooseNightTarget(id: string) {
    if (!currentAction) return;
    setSelection(id);
  }

  function confirmNightAction() {
    if (!currentAction || !selection) return;
    const choice = selection;
    const nextChoices = { ...nightChoices, [currentAction]: choice };
    setNightChoices(nextChoices);
    setSelection("");
    if (nightIndex + 1 < actions.length) setNightIndex(index => index + 1);
    else {
      const target = nextChoices.Mafia;
      const saved = target && nextChoices.Doctor === target;
      const lost = target && !saved ? target : null;
      if (lost) {
        const nextPlayers = players.map(player => player.id === lost ? { ...player, alive: false } : player);
        setPlayers(nextPlayers);
        setWinner(winnerFor(nextPlayers));
      }
      setEliminated(lost ?? null);
      setStage("morning");
    }
  }

  function advanceDiscussion() {
    setSelection("");
    setStage("vote");
  }

  function resolveVote() {
    const lost = selection || null;
    if (lost) setPlayers(current => current.map(player => player.id === lost ? { ...player, alive: false } : player));
    setEliminated(lost);
    const survivors = players.map(player => player.id === lost ? { ...player, alive: false } : player).filter(player => player.alive);
    const resolvedWinner = winnerFor(survivors);
    if (resolvedWinner) { setWinner(resolvedWinner); setStage("gameOver"); }
    else setStage("result");
  }

  function nextRound() {
    setRound(value => value + 1);
    setNightIndex(0);
    setNightChoices({});
    setSelection("");
    setEliminated(null);
    setStage("night");
  }

  function restart() {
    setStage("setup"); setNames([]); setPlayers([]); setRound(1); setDealIndex(0); setCardShown(false); setNightIndex(0); setNightChoices({}); setSelection(""); setEliminated(null); setWinner(null);
  }

  const selectionTargets = living.filter(player => currentAction === "Mafia" ? player.role !== "Mafia" : true);
  const selectedName = players.find(player => player.id === selection)?.name;

  return <div className="glow relative min-h-screen overflow-hidden"><div className="grain pointer-events-none absolute inset-0" /><div className="relative z-10 mx-auto max-w-4xl px-4 pb-12 sm:px-7">
    <header className="flex items-center justify-between gap-3 border-b-2 border-foreground/40 py-5"><Link href="/" className="flex items-center gap-2.5" aria-label="Nookplay home"><span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-primary text-[#16181d] shadow-[3px_3px_0_#ffe16a]"><Moon size={22} fill="currentColor" /></span><span className="display text-[26px] sm:text-[30px]">nookplay<span className="text-primary">.</span></span></Link><Link href="/" className="chip text-xs font-black"><ArrowLeft size={15} /> Room game</Link></header>

    <main className="py-8 sm:py-12">
      <div className="mb-7 text-center sm:mb-10"><p className="eyebrow mb-3">One device · One narrator</p><h1 className="display text-4xl uppercase sm:text-6xl">PASS &amp; <span className="text-primary">PLAY.</span></h1><p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted sm:text-base">Hand the phone around for secret cards. Then use the narrator dashboard to choose role and player cards, record what happens, and keep the room moving.</p></div>

      {stage === "setup" && <section className="panel mx-auto max-w-2xl overflow-hidden"><div className="panel-head"><div><p className="eyebrow mb-1">01 / Build the table</p><h2 className="display text-2xl sm:text-3xl">WHO IS PLAYING?</h2></div><Users className="text-gold" /></div><div className="p-4 sm:p-7"><div className="flex gap-2"><Input aria-label="Player name" value={draftName} onChange={event => setDraftName(event.target.value.toUpperCase())} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addPlayer(); } }} placeholder="PLAYER NAME" maxLength={22} /><Button onClick={addPlayer} disabled={!cleanName(draftName) || names.includes(cleanName(draftName)) || names.length >= 16}>Add <ArrowRight size={16} /></Button></div><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">{names.map((name, index) => <button key={name} onClick={() => setNames(current => current.filter(item => item !== name))} className="flex min-w-0 items-center gap-2 border-2 border-foreground/50 bg-[#171a20] p-3 text-left text-sm font-black hover:border-primary"><span className="text-primary">{String(index + 1).padStart(2, "0")}</span><span className="truncate">{name}</span></button>)}</div>{names.length === 0 && <p className="py-10 text-center text-sm text-muted">Add 4–16 players. Tap a player card to remove it.</p>}<div className="mt-6 border-2 border-gold bg-gold/10 p-4"><p className="font-black text-gold">{names.length}/16 PLAYERS</p><p className="mt-1 text-sm leading-6 text-muted">Mafia, Doctor, Detective, and Villagers are dealt automatically. Add at least four players to begin.</p></div><Button size="lg" className="mt-5 w-full" disabled={names.length < 4} onClick={startDeal}>Deal secret cards <ArrowRight size={18} /></Button></div></section>}

      {stage === "deal" && dealPlayer && <section className="mx-auto max-w-xl"><div className="mb-5 flex items-center justify-between"><span className="chip text-xs font-black">Card {dealIndex + 1}/{players.length}</span><span className="eyebrow">Pass the phone</span></div><div className={`panel min-h-[480px] p-5 text-center sm:p-8 ${cardShown ? "" : "flex flex-col justify-center"}`}><p className="eyebrow mb-3">Private card for</p><h2 className="display text-4xl sm:text-5xl">{dealPlayer.name}</h2>{cardShown ? <RoleCard role={dealPlayer.role} /> : <><div className="mx-auto mt-8 flex h-32 w-28 items-center justify-center border-2 border-foreground bg-gold text-[#17191f] shadow-[7px_7px_0_#ff7da8]"><EyeOff size={44} /></div><p className="mt-8 text-sm leading-6 text-muted">Make sure nobody else can see. Then tap below to reveal the card.</p><Button size="lg" className="mt-6 w-full" onClick={showCard}>Show {dealPlayer.name}&apos;s card <Eye size={18} /></Button></>}{cardShown && <Button variant="gold" size="lg" className="mt-6 w-full" onClick={nextCard}>I saw it · pass phone <ArrowRight size={18} /></Button>}</div></section>}

      {stage === "night" && currentAction && <section className="mx-auto max-w-3xl"><StageHeader round={round} title="Night falls" copy="Keep the room quiet. Choose a role card, then choose their player card." icon={<Moon size={25} />} /><div className="panel mt-5 overflow-hidden"><div className="border-b-2 border-foreground/40 p-4 sm:p-6"><div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center border-2 border-foreground bg-primary text-[#17191f]">{(() => { const Icon = actionCopy[currentAction].Icon; return <Icon size={25} />; })()}</span><div><p className="eyebrow mb-1">Step {nightIndex + 1}/{actions.length}</p><h2 className="display text-2xl">{actionCopy[currentAction].title}</h2></div></div><p className="mt-4 text-sm leading-6 text-muted">{actionCopy[currentAction].prompt}</p></div><div className="p-4 sm:p-6"><p className="field-label">Choose a player</p><PlayerGrid players={selectionTargets} selected={selection} onSelect={chooseNightTarget} showRoles /><div className="mt-5 flex flex-col gap-3 border-t-2 border-foreground/40 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted">{selectedName ? <><strong className="text-foreground">{selectedName}</strong> is selected.</> : "Choose one card to continue."}</p><Button size="lg" disabled={!selection} onClick={confirmNightAction}>Confirm {currentAction} <Check size={18} /></Button></div></div></div></section>}

      {stage === "morning" && <section className="mx-auto max-w-2xl"><StageHeader round={round} title="The city wakes" copy="Read the result aloud, then let everyone talk." icon={<Sun size={25} />} /><div className="panel mt-5 p-6 text-center sm:p-10"><Sun className="mx-auto text-gold" size={46} />{eliminated ? <><p className="eyebrow mt-6">Morning announcement</p><h2 className="display mt-3 text-4xl">{players.find(player => player.id === eliminated)?.name} IS OUT.</h2><p className="mt-4 text-sm leading-7 text-muted">Their role stays private. Move into discussion and let the table decide who to suspect.</p></> : <><p className="eyebrow mt-6">Morning announcement</p><h2 className="display mt-3 text-4xl">NO ONE DIED.</h2><p className="mt-4 text-sm leading-7 text-muted">The Doctor protected the target, or the Mafia did not settle on one.</p></>}<Button size="lg" className="mt-8 w-full" onClick={() => setStage(winner ? "gameOver" : "discussion")}>{winner ? "Reveal the winner" : "Begin discussion"} <ArrowRight size={18} /></Button></div></section>}

      {stage === "discussion" && <section className="mx-auto max-w-2xl"><StageHeader round={round} title="Talk it out" copy="Put the phone down. The best part happens at the table." icon={<Users size={25} />} /><div className="panel mt-5 p-6 sm:p-10"><p className="text-center text-lg font-bold leading-8">Who is acting strange? Who has an alibi? Let everyone make their case.</p><div className="mt-7 border-2 border-gold bg-gold/10 p-4 text-sm leading-6 text-muted">When the group is ready, the narrator asks for the vote. Nookplay records the result; it does not need every person to tap the screen.</div><Button size="lg" className="mt-7 w-full" onClick={advanceDiscussion}>Open the vote <ArrowRight size={18} /></Button></div></section>}

      {stage === "vote" && <section className="mx-auto max-w-3xl"><StageHeader round={round} title="The vote" copy="Count the spoken votes, then tap the selected player card." icon={<Skull size={25} />} /><div className="panel mt-5 p-4 sm:p-6"><p className="field-label">Who leaves the table?</p><PlayerGrid players={living} selected={selection} onSelect={setSelection} showRoles /><div className="mt-5 flex flex-col gap-3 border-t-2 border-foreground/40 pt-5 sm:flex-row sm:items-center sm:justify-between"><Button variant="outline" onClick={() => { setSelection(""); setEliminated(null); setStage("result"); }}>No elimination</Button><Button size="lg" disabled={!selection} onClick={resolveVote}>Confirm elimination <Check size={18} /></Button></div></div></section>}

      {stage === "result" && <section className="mx-auto max-w-2xl"><StageHeader round={round} title="Vote result" copy="Keep roles hidden and let the tension sit for a moment." icon={<Sun size={25} />} /><div className="panel mt-5 p-6 text-center sm:p-10"><p className="eyebrow">The table decided</p><h2 className="display mt-3 text-4xl">{eliminated ? `${players.find(player => player.id === eliminated)?.name} IS OUT.` : "NO ONE IS OUT."}</h2><p className="mt-5 text-sm leading-7 text-muted">The narrator still sees the roles in the dashboard. Everyone else keeps guessing.</p><Button size="lg" className="mt-8 w-full" onClick={nextRound}>Start round {round + 1} · night <Moon size={18} /></Button></div></section>}

      {stage === "gameOver" && <section className="mx-auto max-w-2xl"><StageHeader round={round} title="Game over" copy="The secret is out." icon={<Sun size={25} />} /><div className="panel mt-5 p-6 text-center sm:p-10"><p className="eyebrow">Winning team</p><h2 className="display mt-3 text-5xl text-gold">{winner} WINS.</h2><div className="mt-7 grid grid-cols-2 gap-2 text-left">{players.map(player => <div key={player.id} className="border-2 border-foreground/40 bg-[#171a20] p-3"><p className="font-black">{player.name}</p><p className="mt-1 text-xs text-gold">{player.role}</p></div>)}</div><Button size="lg" className="mt-8 w-full" onClick={restart}>Play again <RotateCcw size={18} /></Button></div></section>}
    </main>
  </div></div>;
}

function StageHeader({ round, title, copy, icon }: { round: number; title: string; copy: string; icon: ReactNode }) {
  return <div className="text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center border-2 border-foreground bg-gold text-[#17191f] shadow-[4px_4px_0_#ff7da8]">{icon}</div><p className="eyebrow mt-5">Round {round}</p><h1 className="display mt-2 text-4xl uppercase sm:text-5xl">{title}<span className="text-primary">.</span></h1><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted">{copy}</p></div>;
}

function RoleCard({ role }: { role: Role }) {
  const info = roleInfo[role];
  const Icon = info.icon;
  return <div className={`mt-7 border-2 border-foreground p-6 text-[#17191f] shadow-[6px_6px_0_#ff7da8] ${info.tone}`}><Icon className="mx-auto" size={42} /><p className="mt-5 text-xs font-black uppercase tracking-[.2em]">You are</p><h3 className="display mt-2 text-5xl uppercase">{role}</h3><p className="mt-3 text-sm font-black uppercase">{info.team}</p><p className="mx-auto mt-5 max-w-sm text-sm leading-6">{info.copy}</p></div>;
}

function PlayerGrid({ players, selected, onSelect, showRoles }: { players: Player[]; selected: string; onSelect: (id: string) => void; showRoles?: boolean }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{players.map(player => <button key={player.id} onClick={() => onSelect(player.id)} className={`min-h-24 border-2 p-3 text-left transition ${selected === player.id ? "border-gold bg-gold/15 shadow-[4px_4px_0_#ff7da8]" : "border-foreground/50 bg-[#171a20] hover:border-primary"}`}><span className="mb-3 flex h-8 w-8 items-center justify-center border-2 border-foreground bg-[#8ddcfa] text-sm font-black text-[#17191f]">{player.name.charAt(0)}</span><p className="truncate font-black">{player.name}</p>{showRoles && <p className="mt-1 text-xs text-gold">{player.role}</p>}</button>)}</div>;
}
