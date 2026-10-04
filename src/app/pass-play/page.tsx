"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, HeartPulse, Moon, RotateCcw, Search, Skull, Sun, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { eliminatePassPlayPlayer, livingPassPlayPlayers, passPlayWinner, roleDeck, type PassPlayPlayer, type PassPlayRole } from "@/lib/pass-play";

type Role = PassPlayRole;
type AssignmentRole = Role | string;
type Player = PassPlayPlayer;
type Stage = "setup" | "assign" | "deal" | "unlock" | "night" | "morning" | "discussion" | "vote" | "result" | "gameOver";
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

export default function PassPlayPage() {
  const [stage, setStage] = useState<Stage>("setup");
  const [draftName, setDraftName] = useState("");
  const [names, setNames] = useState<string[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [adminCode, setAdminCode] = useState("");
  const [unlockCode, setUnlockCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [assignmentMode, setAssignmentMode] = useState<"random" | "manual">("random");
  const [roleCounts, setRoleCounts] = useState({ mafia: 1, doctor: 1, detective: 1, nightSeconds: 120, discussionSeconds: 300, votingSeconds: 120 });
  const [customRoleName, setCustomRoleName] = useState("");
  const [customRoleCount, setCustomRoleCount] = useState(0);
  const [manualAssignments, setManualAssignments] = useState<Record<string, AssignmentRole>>({});
  const [assignRole, setAssignRole] = useState<AssignmentRole>("Mafia");
  const [dealIndex, setDealIndex] = useState(0);
  const [cardShown, setCardShown] = useState(false);
  const [round, setRound] = useState(1);
  const [nightIndex, setNightIndex] = useState(0);
  const [nightChoices, setNightChoices] = useState<Partial<Record<NightAction, string>>>({});
  const [selection, setSelection] = useState("");
  const [eliminated, setEliminated] = useState<string | null>(null);
  const [winner, setWinner] = useState<"Mafia" | "Town" | null>(null);
  const [now, setNow] = useState(Date.now());
  const [phaseEndsAt, setPhaseEndsAt] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const living = livingPassPlayPlayers(players);
  const actions = useMemo(() => (["Mafia", "Doctor", "Detective"] as NightAction[]).filter(action => players.some(player => player.alive && player.role === action)), [players]);
  const currentAction = actions[nightIndex];
  const dealPlayer = players[dealIndex];
  const customRole = cleanName(customRoleName);
  const deck = roleDeck({ mafia: roleCounts.mafia, doctor: roleCounts.doctor, detective: roleCounts.detective, playerCount: names.length, customTownCount: customRoleCount });
  const fullDeck = deck && [...deck, ...Array<string>(customRoleCount).fill(customRole)];
  const configuredRoleCounts: Record<string, number> = { Mafia: roleCounts.mafia, Doctor: roleCounts.doctor, Detective: roleCounts.detective, Villager: deck?.filter(role => role === "Villager").length ?? 0, ...(customRole && customRoleCount ? { [customRole]: customRoleCount } : {}) };
  const assignmentRoles = Object.keys(configuredRoleCounts).filter(role => configuredRoleCounts[role] > 0);
  const visibleRemaining = paused ? remainingMs ?? 0 : phaseEndsAt ? Math.max(0, phaseEndsAt - now) : null;

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (stage !== "discussion") return;
    setPaused(false);
    setRemainingMs(null);
    setPhaseEndsAt(Date.now() + roleCounts.discussionSeconds * 1000);
  }, [stage, roleCounts.discussionSeconds]);

  function addPlayer() {
    const name = cleanName(draftName);
    if (!name || names.includes(name) || names.length >= 16) return;
    setNames(current => [...current, name]);
    setDraftName("");
  }

  function shuffleDeck() {
    const roles = [...(fullDeck ?? [])];
    for (let index = roles.length - 1; index > 0; index--) {
      const next = Math.floor(Math.random() * (index + 1));
      [roles[index], roles[next]] = [roles[next], roles[index]];
    }
    return roles;
  }

  function prepareDeal() {
    const roles = shuffleDeck();
    setPlayers(names.map((name, index) => ({ id: makeId(), name, role: roles[index], alive: true })));
    setDealIndex(0);
    setCardShown(false);
    setStage("deal");
  }

  function startRoleSetup() {
    if (!fullDeck || adminCode.length < 4) return;
    if (assignmentMode === "random") { prepareDeal(); return; }
    setManualAssignments({});
    setAssignRole("Mafia");
    setStage("assign");
  }

  // Retained for the legacy setup markup below; the active setup screen is the
  // dedicated narrator configuration rendered before that markup.
  function startDeal() { startRoleSetup(); }

  function completeManualDeal() {
    if (!fullDeck || Object.keys(manualAssignments).length !== names.length) return;
    setPlayers(names.map(name => ({ id: makeId(), name, role: manualAssignments[name], alive: true })));
    setDealIndex(0);
    setCardShown(false);
    setStage("deal");
  }

  function assignManualRole(name: string) {
    const used = Object.values(manualAssignments).filter(role => role === assignRole).length;
    if (manualAssignments[name] || used >= (configuredRoleCounts[assignRole] ?? 0)) return;
    setManualAssignments(current => ({ ...current, [name]: assignRole }));
  }

  function beginTimedStage(next: "night" | "discussion" | "vote") {
    const seconds = next === "night" ? roleCounts.nightSeconds : next === "discussion" ? roleCounts.discussionSeconds : roleCounts.votingSeconds;
    setPaused(false);
    setRemainingMs(null);
    setPhaseEndsAt(Date.now() + seconds * 1000);
    setStage(next);
  }

  function pauseOrResumeTimer() {
    if (paused) {
      setPhaseEndsAt(Date.now() + (remainingMs ?? 0));
      setRemainingMs(null);
      setPaused(false);
    } else if (phaseEndsAt) {
      setRemainingMs(Math.max(0, phaseEndsAt - Date.now()));
      setPhaseEndsAt(null);
      setPaused(true);
    }
  }

  function extendTimer() {
    if (paused) setRemainingMs(current => (current ?? 0) + 60_000);
    else setPhaseEndsAt(current => Math.max(Date.now(), current ?? Date.now()) + 60_000);
  }

  function showCard() {
    if (timer.current) clearTimeout(timer.current);
    setCardShown(true);
  }

  function nextCard() {
    setCardShown(false);
    if (dealIndex + 1 < players.length) setDealIndex(index => index + 1);
    else { setStage("unlock"); setUnlockCode(""); setCodeError(""); }
  }

  function unlockNarrator() {
    if (unlockCode !== adminCode) {
      setCodeError("That PIN does not match the narrator PIN.");
      return;
    }
    setCodeError("");
    setNightIndex(0);
    setNightChoices({});
    setSelection("");
    beginTimedStage("night");
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
        const nextPlayers = eliminatePassPlayPlayer(players, lost);
        setPlayers(nextPlayers);
        setWinner(passPlayWinner(nextPlayers));
      }
      setEliminated(lost ?? null);
      setStage("morning");
    }
  }

  function advanceDiscussion() {
    setSelection("");
    beginTimedStage("vote");
  }

  function resolveVote() {
    const lost = selection || null;
    if (lost) setPlayers(current => eliminatePassPlayPlayer(current, lost));
    setEliminated(lost);
    const survivors = eliminatePassPlayPlayer(players, lost);
    const resolvedWinner = passPlayWinner(survivors);
    if (resolvedWinner) { setWinner(resolvedWinner); setStage("gameOver"); }
    else setStage("result");
  }

  function nextRound() {
    setRound(value => value + 1);
    setNightIndex(0);
    setNightChoices({});
    setSelection("");
    setEliminated(null);
    beginTimedStage("night");
  }

  function restart() {
    setStage("setup"); setNames([]); setPlayers([]); setRound(1); setDealIndex(0); setCardShown(false); setNightIndex(0); setNightChoices({}); setSelection(""); setEliminated(null); setWinner(null); setAdminCode(""); setUnlockCode(""); setCodeError(""); setPhaseEndsAt(null); setPaused(false); setRemainingMs(null);
  }

  const selectionTargets = living.filter(player => currentAction === "Mafia" ? player.role !== "Mafia" : true);
  const selectedName = players.find(player => player.id === selection)?.name;
  const currentStage = stage;

  if (currentStage === "setup") return <NarratorSetup
    draftName={draftName} names={names} adminCode={adminCode} roleCounts={roleCounts} assignmentMode={assignmentMode} deck={fullDeck} customRoleName={customRoleName} customRoleCount={customRoleCount}
    onDraftName={setDraftName} onAddPlayer={addPlayer} onRemovePlayer={name => setNames(current => current.filter(item => item !== name))}
    onAdminCode={value => setAdminCode(value.replace(/\D/g, "").slice(0, 12))}
    onRoleCounts={setRoleCounts} onCustomRoleName={setCustomRoleName} onCustomRoleCount={setCustomRoleCount} onAssignmentMode={setAssignmentMode} onContinue={startRoleSetup}
  />;

  if (currentStage === "assign") return <ManualRoleAssignment
    names={names} roleCounts={configuredRoleCounts} roles={assignmentRoles} assignments={manualAssignments} selectedRole={assignRole}
    onSelectRole={setAssignRole} onAssign={assignManualRole} onClear={() => setManualAssignments({})} onContinue={completeManualDeal}
  />;

  if (currentStage === "unlock") return <NarratorUnlock code={unlockCode} error={codeError} onCode={value => { setUnlockCode(value.replace(/\D/g, "").slice(0, 12)); setCodeError(""); }} onUnlock={unlockNarrator} />;

  return <div className="glow relative min-h-screen overflow-hidden"><div className="grain pointer-events-none absolute inset-0" /><div className="relative z-10 mx-auto max-w-4xl px-4 pb-12 sm:px-7">
    <header className="flex items-center justify-between gap-3 border-b-2 border-foreground/40 py-5"><Link href="/" className="flex items-center gap-2.5" aria-label="Nookplay home"><span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-primary text-[#16181d] shadow-[3px_3px_0_#ffe16a]"><Moon size={22} fill="currentColor" /></span><span className="display text-[26px] sm:text-[30px]">nookplay<span className="text-primary">.</span></span></Link><Link href="/" className="chip text-xs font-black"><ArrowLeft size={15} /> Room game</Link></header>

    <main className="py-8 sm:py-12">
      {(stage === "night" || stage === "discussion" || stage === "vote") && visibleRemaining !== null && <TimerDock milliseconds={visibleRemaining} paused={paused} onToggle={pauseOrResumeTimer} onExtend={extendTimer} />}
      {(stage === "night" || stage === "morning" || stage === "discussion" || stage === "vote" || stage === "result") && <NarratorRoster players={players} />}
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

function RoleCard({ role }: { role: string }) {
  const info = roleInfo[role as Role] ?? { team: "Town", copy: "Use the role your group agreed on. This card has no built-in night action.", icon: Users, tone: "bg-[#8ddcfa]" };
  const Icon = info.icon;
  return <div className={`mt-7 border-2 border-foreground p-6 text-[#17191f] shadow-[6px_6px_0_#ff7da8] ${info.tone}`}><Icon className="mx-auto" size={42} /><p className="mt-5 text-xs font-black uppercase tracking-[.2em]">You are</p><h3 className="display mt-2 text-5xl uppercase">{role}</h3><p className="mt-3 text-sm font-black uppercase">{info.team}</p><p className="mx-auto mt-5 max-w-sm text-sm leading-6">{info.copy}</p></div>;
}

function PlayerGrid({ players, selected, onSelect, showRoles }: { players: Player[]; selected: string; onSelect: (id: string) => void; showRoles?: boolean }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{players.map(player => <button key={player.id} onClick={() => onSelect(player.id)} className={`min-h-24 border-2 p-3 text-left transition ${selected === player.id ? "border-gold bg-gold/15 shadow-[4px_4px_0_#ff7da8]" : "border-foreground/50 bg-[#171a20] hover:border-primary"}`}><span className="mb-3 flex h-8 w-8 items-center justify-center border-2 border-foreground bg-[#8ddcfa] text-sm font-black text-[#17191f]">{player.name.charAt(0)}</span><p className="truncate font-black">{player.name}</p>{showRoles && <p className="mt-1 text-xs text-gold">{player.role}</p>}</button>)}</div>;
}

type RoleCounts = { mafia: number; doctor: number; detective: number; nightSeconds: number; discussionSeconds: number; votingSeconds: number };

function NarratorSetup({ draftName, names, adminCode, roleCounts, assignmentMode, deck, customRoleName, customRoleCount, onDraftName, onAddPlayer, onRemovePlayer, onAdminCode, onRoleCounts, onCustomRoleName, onCustomRoleCount, onAssignmentMode, onContinue }: {
  draftName: string; names: string[]; adminCode: string; roleCounts: RoleCounts; assignmentMode: "random" | "manual"; deck: string[] | null; customRoleName: string; customRoleCount: number;
  onDraftName: (value: string) => void; onAddPlayer: () => void; onRemovePlayer: (name: string) => void; onAdminCode: (value: string) => void;
  onRoleCounts: React.Dispatch<React.SetStateAction<RoleCounts>>; onCustomRoleName: (value: string) => void; onCustomRoleCount: (value: number) => void; onAssignmentMode: (value: "random" | "manual") => void; onContinue: () => void;
}) {
  const valid = names.length >= 4 && Boolean(deck) && adminCode.length >= 4;
  const setNumber = (key: keyof RoleCounts, value: string, minimum: number, maximum: number) => {
    const parsed = Number(value);
    onRoleCounts(current => ({ ...current, [key]: Math.min(maximum, Math.max(minimum, Number.isFinite(parsed) ? parsed : minimum)) }));
  };
  const villagers = deck?.filter(role => role === "Villager").length ?? 0;

  return <div className="glow relative min-h-screen overflow-hidden"><div className="grain pointer-events-none absolute inset-0" /><div className="relative z-10 mx-auto max-w-4xl px-4 pb-12 sm:px-7">
    <header className="flex items-center justify-between gap-3 border-b-2 border-foreground/40 py-5"><Link href="/" className="flex items-center gap-2.5" aria-label="Nookplay home"><span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-primary text-[#16181d] shadow-[3px_3px_0_#ffe16a]"><Moon size={22} fill="currentColor" /></span><span className="display text-[26px] sm:text-[30px]">nookplay<span className="text-primary">.</span></span></Link><Link href="/" className="chip text-xs font-black"><ArrowLeft size={15} /> Room game</Link></header>
    <main className="py-8 sm:py-12"><div className="mb-7 text-center sm:mb-10"><p className="eyebrow mb-3">One device · One narrator</p><h1 className="display text-4xl uppercase sm:text-6xl">PASS &amp; <span className="text-primary">PLAY.</span></h1><p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted sm:text-base">Set up the game, then pass one phone for private role cards. The narrator PIN brings control back after every player has looked.</p></div>
      <section className="panel mx-auto max-w-2xl overflow-hidden"><div className="panel-head"><div><p className="eyebrow mb-1">01 / Narrator setup</p><h2 className="display text-2xl sm:text-3xl">BUILD THE TABLE.</h2></div><Users className="text-gold" /></div><div className="space-y-6 p-4 sm:p-7">
        <div><label className="field-label" htmlFor="pass-player-name">Add players</label><div className="flex gap-2"><Input id="pass-player-name" value={draftName} onChange={event => onDraftName(event.target.value.toUpperCase())} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); onAddPlayer(); } }} placeholder="PLAYER NAME" maxLength={22} /><Button onClick={onAddPlayer} disabled={!cleanName(draftName) || names.includes(cleanName(draftName)) || names.length >= 16}>Add <ArrowRight size={16} /></Button></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{names.map((name, index) => <button key={name} onClick={() => onRemovePlayer(name)} className="flex min-w-0 items-center gap-2 border-2 border-foreground/50 bg-[#171a20] p-3 text-left text-sm font-black hover:border-primary"><span className="text-primary">{String(index + 1).padStart(2, "0")}</span><span className="truncate">{name}</span></button>)}</div><p className="mt-3 text-sm text-muted">{names.length ? `${names.length}/16 players · tap a name to remove it.` : "Add 4–16 players to begin."}</p></div>
        <div className="grid gap-4 border-y-2 border-foreground/40 py-6 sm:grid-cols-2"><div><label className="field-label" htmlFor="narrator-pin">Narrator PIN</label><Input id="narrator-pin" type="password" inputMode="numeric" pattern="[0-9]*" minLength={4} maxLength={12} value={adminCode} onChange={event => onAdminCode(event.target.value)} placeholder="4–12 DIGITS" /><p className="mt-2 text-xs leading-5 text-muted">Use this PIN after the private cards to return the phone to narrator control.</p></div><div className="border-2 border-gold bg-gold/10 p-4"><p className="eyebrow text-gold">One-phone game</p><p className="mt-2 text-sm leading-6 text-muted">The game stays on this device. Keep the PIN private while cards are being passed around.</p></div></div>
        <div><p className="field-label">Role cards</p><div className="grid grid-cols-3 gap-2"><NumberSetting label="Mafia" value={roleCounts.mafia} onChange={value => setNumber("mafia", value, 1, Math.max(1, names.length - 1))} /><NumberSetting label="Doctor" value={roleCounts.doctor} onChange={value => setNumber("doctor", value, 0, 1)} /><NumberSetting label="Detective" value={roleCounts.detective} onChange={value => setNumber("detective", value, 0, 1)} /></div><p className={`mt-3 text-sm ${deck ? "text-muted" : "text-primary"}`}>{deck ? `${roleCounts.mafia} Mafia · ${roleCounts.doctor} Doctor · ${roleCounts.detective} Detective · ${villagers} Villagers` : "Keep more Town players than Mafia, with at least one Villager."}</p></div>
        <div><p className="field-label">Role assignment</p><div className="grid grid-cols-2 gap-2"><button onClick={() => onAssignmentMode("random")} className={`border-2 p-3 text-left ${assignmentMode === "random" ? "border-gold bg-gold/10 shadow-[3px_3px_0_#ff7da8]" : "border-foreground/50 bg-[#171a20]"}`}><p className="font-black">SHUFFLE</p><p className="mt-1 text-xs text-muted">Deal random cards</p></button><button onClick={() => onAssignmentMode("manual")} className={`border-2 p-3 text-left ${assignmentMode === "manual" ? "border-gold bg-gold/10 shadow-[3px_3px_0_#ff7da8]" : "border-foreground/50 bg-[#171a20]"}`}><p className="font-black">ASSIGN</p><p className="mt-1 text-xs text-muted">Choose every card</p></button></div></div>
        <div><p className="field-label">Phase timers</p><div className="grid grid-cols-3 gap-2"><NumberSetting label="Night" suffix="sec" value={roleCounts.nightSeconds} onChange={value => setNumber("nightSeconds", value, 30, 1800)} /><NumberSetting label="Talk" suffix="sec" value={roleCounts.discussionSeconds} onChange={value => setNumber("discussionSeconds", value, 30, 1800)} /><NumberSetting label="Vote" suffix="sec" value={roleCounts.votingSeconds} onChange={value => setNumber("votingSeconds", value, 30, 1800)} /></div></div>
        <div className="border-t-2 border-foreground/40 pt-6"><p className="field-label">Custom role card</p><div className="grid gap-2 sm:grid-cols-[1fr_110px]"><Input value={customRoleName} onChange={event => onCustomRoleName(event.target.value.toUpperCase())} placeholder="ROLE NAME, E.G. JOKER" maxLength={22} /><NumberSetting label="Cards" value={customRoleCount} onChange={value => onCustomRoleCount(Math.min(Math.max(Number(value) || 0, 0), names.length))} /></div><p className="mt-3 text-sm leading-6 text-muted">Custom cards are Town by default and have no built-in night action. Your group can use any agreed rule for them.</p></div>
        <Button size="lg" className="w-full" disabled={!valid || (customRoleCount > 0 && !cleanName(customRoleName))} onClick={onContinue}>{assignmentMode === "manual" ? "Choose role cards" : "Shuffle & deal cards"} <ArrowRight size={18} /></Button>
      </div></section>
    </main>
  </div></div>;
}

function NumberSetting({ label, suffix, value, onChange }: { label: string; suffix?: string; value: number; onChange: (value: string) => void }) {
  return <label className="border-2 border-foreground/50 bg-[#171a20] p-3"><span className="block text-xs font-black uppercase text-gold">{label}</span><span className="mt-2 flex items-center gap-1"><input className="min-w-0 w-full bg-transparent text-lg font-black outline-none" type="number" inputMode="numeric" value={value} onChange={event => onChange(event.target.value)} /><span className="text-xs text-muted">{suffix}</span></span></label>;
}

function ManualRoleAssignment({ names, roleCounts, roles, assignments, selectedRole, onSelectRole, onAssign, onClear, onContinue }: { names: string[]; roleCounts: Record<string, number>; roles: string[]; assignments: Record<string, AssignmentRole>; selectedRole: AssignmentRole; onSelectRole: (role: AssignmentRole) => void; onAssign: (name: string) => void; onClear: () => void; onContinue: () => void }) {
  const assignedCount = Object.keys(assignments).length;
  return <PassPlayShell eyebrow="02 / Narrator setup" title="ASSIGN THE CARDS." copy="Select a role card, then tap each player. These assignments stay hidden when the phone is passed around."><section className="panel overflow-hidden"><div className="p-4 sm:p-7"><p className="field-label">Choose a role card</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{roles.map(role => { const used = Object.values(assignments).filter(value => value === role).length; const remaining = roleCounts[role] - used; return <button key={role} disabled={remaining < 1} onClick={() => onSelectRole(role)} className={`border-2 p-3 text-left disabled:cursor-not-allowed disabled:opacity-40 ${selectedRole === role ? "border-gold bg-gold/10 shadow-[3px_3px_0_#ff7da8]" : "border-foreground/50 bg-[#171a20]"}`}><p className="font-black">{role.toUpperCase()}</p><p className="mt-1 text-xs text-muted">{remaining} left</p></button>; })}</div><p className="field-label mt-6">Tap a player</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{names.map((name, index) => <button key={name} disabled={Boolean(assignments[name])} onClick={() => onAssign(name)} className="min-h-20 border-2 border-foreground/50 bg-[#171a20] p-3 text-left disabled:opacity-55"><p className="text-xs font-black text-primary">{String(index + 1).padStart(2, "0")}</p><p className="mt-1 truncate font-black">{name}</p><p className="mt-1 text-xs text-gold">{assignments[name] ?? "Unassigned"}</p></button>)}</div><div className="mt-6 flex flex-col gap-3 border-t-2 border-foreground/40 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-muted">{assignedCount}/{names.length} cards assigned</p><Button variant="outline" onClick={onClear}>Clear cards</Button><Button disabled={assignedCount !== names.length} onClick={onContinue}>Deal private cards <ArrowRight size={18} /></Button></div></div></section></PassPlayShell>;
}

function NarratorUnlock({ code, error, onCode, onUnlock }: { code: string; error: string; onCode: (value: string) => void; onUnlock: () => void }) {
  return <PassPlayShell eyebrow="Narrator return" title="ENTER YOUR PIN." copy="Every player has seen their secret card. Enter the narrator PIN to begin the first night."><section className="panel mx-auto max-w-md p-5 sm:p-8"><label className="field-label" htmlFor="unlock-pin">Narrator PIN</label><Input id="unlock-pin" autoFocus type="password" inputMode="numeric" pattern="[0-9]*" maxLength={12} value={code} onChange={event => onCode(event.target.value)} onKeyDown={event => { if (event.key === "Enter") onUnlock(); }} placeholder="ENTER PIN" />{error && <p className="mt-3 text-sm font-bold text-primary">{error}</p>}<Button size="lg" className="mt-5 w-full" onClick={onUnlock}>Open narrator dashboard <ArrowRight size={18} /></Button></section></PassPlayShell>;
}

function PassPlayShell({ eyebrow, title, copy, children }: { eyebrow: string; title: string; copy: string; children: ReactNode }) {
  return <div className="glow relative min-h-screen overflow-hidden"><div className="grain pointer-events-none absolute inset-0" /><div className="relative z-10 mx-auto max-w-4xl px-4 pb-12 sm:px-7"><header className="flex items-center justify-between gap-3 border-b-2 border-foreground/40 py-5"><Link href="/" className="flex items-center gap-2.5" aria-label="Nookplay home"><span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-primary text-[#16181d] shadow-[3px_3px_0_#ffe16a]"><Moon size={22} fill="currentColor" /></span><span className="display text-[26px] sm:text-[30px]">nookplay<span className="text-primary">.</span></span></Link><Link href="/" className="chip text-xs font-black"><ArrowLeft size={15} /> Room game</Link></header><main className="py-8 sm:py-12"><div className="mb-7 text-center sm:mb-10"><p className="eyebrow mb-3">{eyebrow}</p><h1 className="display text-4xl uppercase sm:text-6xl">{title}<span className="text-primary">.</span></h1><p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted sm:text-base">{copy}</p></div>{children}</main></div></div>;
}

function TimerDock({ milliseconds, paused, onToggle, onExtend }: { milliseconds: number; paused: boolean; onToggle: () => void; onExtend: () => void }) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return <div className="mb-6 flex items-center justify-between gap-3 border-2 border-gold bg-[#171a20] p-3 shadow-[4px_4px_0_#ff7da8]"><div><p className="eyebrow text-gold">{paused ? "Timer paused" : "Phase timer"}</p><p className="display mt-1 text-2xl">{minutes}:{seconds}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={onExtend}>+1 min</Button><Button size="sm" onClick={onToggle}>{paused ? "Resume" : "Pause"}</Button></div></div>;
}

function NarratorRoster({ players }: { players: Player[] }) {
  return <details className="panel mb-6 overflow-hidden" open><summary className="cursor-pointer list-none px-4 py-3 sm:px-5"><span className="flex items-center justify-between gap-3"><span><span className="eyebrow block">Narrator only</span><span className="display mt-1 block text-lg">WHO REMAINS?</span></span><span className="chip text-xs font-black">{players.filter(player => player.alive).length} alive</span></span></summary><div className="grid grid-cols-2 gap-px border-t-2 border-foreground/40 bg-foreground/40 sm:grid-cols-4">{players.map(player => <div key={player.id} className="bg-[#171a20] p-3"><p className="truncate font-black">{player.name}</p><p className="mt-1 text-xs text-gold">{player.role}</p><p className={`mt-2 text-xs font-black uppercase ${player.alive ? "text-[#8ddcfa]" : "text-primary"}`}>{player.alive ? "Alive" : "Out"}</p></div>)}</div></details>;
}
