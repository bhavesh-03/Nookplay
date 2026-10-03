"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Clipboard, Eye, EyeOff, HeartPulse, LockKeyhole, Moon, Plus, RotateCcw, Shield, Shuffle, Skull, Sparkles, Sun, Trash2, Users, Vote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Team = "Mafia" | "Town";
type Ability = "night_vote" | "inspect" | "protect" | "none";
type Phase = "lobby" | "reveal" | "night" | "morning" | "discussion" | "voting" | "result" | "game_over";
type Role = { id: string; name: string; team: Team; ability: Ability; count: number };
type Player = { id: string; name: string; alive: boolean; roleId?: string | null };
type Elimination = { playerId: string; playerName: string; wasMafia: boolean };
type Announcement = { playerId: string | null; playerName: string | null; wasMafia: boolean | null; eliminations?: Elimination[]; kind: "night" | "vote"; noElimination: boolean };
type RoomView = { code: string; capacity: number; phase: Phase; round: number; revision: number; players: Player[]; roles: Role[]; announcement: Announcement | null; winner: Team | null; viewer: { id: string; name: string; alive: boolean; host: boolean; role: Role | null } };
type Session = { code: string; token: string; playerId: string };
const sessionKey = "nookplay-session-v2";
const hostRecoveryKey = "nookplay-host-session-v1";
const abilityLabels: Record<Ability, string> = { night_vote: "Night vote", inspect: "Inspect", protect: "Protect", none: "No action" };

function iconFor(ability: Ability) {
  if (ability === "night_vote") return <Skull size={20} />;
  if (ability === "protect") return <HeartPulse size={20} />;
  if (ability === "inspect") return <Eye size={20} />;
  return <Users size={20} />;
}
function phaseLabel(phase: Phase) {
  return ({ lobby: "Waiting room", reveal: "Secret reveal", night: "Night falls", morning: "Morning result", discussion: "Discussion", voting: "The vote", result: "Vote result", game_over: "Game over" })[phase];
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [capacity, setCapacity] = useState(6);
  const [rolesDraft, setRolesDraft] = useState<Role[]>([]);
  const [rolesDirty, setRolesDirty] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [recoverableHost, setRecoverableHost] = useState<Session | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    try {
      const savedHost = localStorage.getItem(hostRecoveryKey);
      const host = savedHost ? JSON.parse(savedHost) as Session : null;
      if (host?.playerId === "host") setRecoverableHost(host);
      const stored = sessionStorage.getItem(sessionKey);
      const active = stored ? JSON.parse(stored) as Session : host;
      if (active?.code && active?.token) setSession(active);
    } catch { /* Ignore damaged browser storage. */ }
    const params = new URLSearchParams(location.search);
    const joinCode = params.get("join");
    if (joinCode) { setMode("join"); setCode(joinCode.toUpperCase().slice(0, 6)); }
  }, []);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const fetchRoom = useCallback(async (current: Session) => {
    try {
      const response = await fetch(`/api/rooms/${current.code}`, { headers: { "x-room-token": current.token }, cache: "no-store" });
      const data = await response.json();
      if (sessionRef.current?.token !== current.token) return;
      if (!response.ok) throw new Error(data.error ?? "Could not load the room.");
      setRoom(previous => !previous || data.revision >= previous.revision ? data as RoomView : previous); setError("");
      if ((data as RoomView).viewer.host) {
        try { localStorage.setItem(hostRecoveryKey, JSON.stringify(current)); } catch { /* Recovery stays available for this tab. */ }
        setRecoverableHost(current);
      }
    } catch (reason) { if (sessionRef.current?.token === current.token) setError(reason instanceof Error ? reason.message : "Connection lost."); }
  }, []);

  useEffect(() => {
    if (!session) return;
    void fetchRoom(session);
    const interval = setInterval(() => void fetchRoom(session), 2000);
    return () => clearInterval(interval);
  }, [session, fetchRoom]);
  useEffect(() => { if (room && !rolesDirty) setRolesDraft(room.roles); }, [room, rolesDirty]);
  useEffect(() => { setRevealed(false); setSelectedPlayers([]); }, [room?.phase]);

  async function enter(action: "create" | "join") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, name, code, capacity }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not enter the room.");
      const next = data as Session;
      sessionStorage.setItem(sessionKey, JSON.stringify(next));
      if (action === "create") { localStorage.setItem(hostRecoveryKey, JSON.stringify(next)); setRecoverableHost(next); }
      sessionRef.current = next;
      setSession(next); setName("");
      history.replaceState(null, "", "/");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not enter the room."); }
    finally { setBusy(false); }
  }

  async function hostAction(action: string, payload: Record<string, unknown> = {}) {
    if (!session) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/rooms/${session.code}`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-room-token": session.token }, body: JSON.stringify({ action, ...payload }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not update the game.");
      if (sessionRef.current?.token !== session.token) return;
      setRoom(previous => !previous || data.revision >= previous.revision ? data as RoomView : previous);
      if (action === "roles") setRolesDirty(false);
      setSelectedPlayers([]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the game."); }
    finally { setBusy(false); }
  }

  function leave() {
    sessionRef.current = null;
    sessionStorage.removeItem(sessionKey);
    setSession(null); setRoom(null); setRolesDirty(false); setRevealed(false); setError("");
  }
  function resumeHost() {
    if (!recoverableHost) return;
    sessionStorage.setItem(sessionKey, JSON.stringify(recoverableHost));
    sessionRef.current = recoverableHost;
    setSession(recoverableHost);
    setError("");
  }
  function toggleElimination(playerId: string) {
    setSelectedPlayers(current => current.includes(playerId) ? current.filter(id => id !== playerId) : [...current, playerId]);
  }
  async function copyInvite() {
    if (!room) return;
    try { await navigator.clipboard.writeText(`${location.origin}/?join=${room.code}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setError("Copy failed. Share the room code instead."); }
  }
  function editRole(id: string, changes: Partial<Role>) { setRolesDraft(current => current.map(role => role.id === id ? { ...role, ...changes } : role)); setRolesDirty(true); }
  function holdReveal() { revealTimer.current = setTimeout(() => setRevealed(true), 700); }
  function releaseReveal() { if (revealTimer.current) clearTimeout(revealTimer.current); }
  const assignedCount = room?.players.filter(player => player.roleId).length ?? 0;
  const roleTotal = rolesDraft.reduce((sum, role) => sum + role.count, 0);
  const rolesMatch = !!room && room.roles.every(role => room.players.filter(player => player.roleId === role.id).length === role.count);
  const canReveal = !!room && room.players.length >= 4 && !rolesDirty && room.roles.reduce((sum, role) => sum + role.count, 0) === room.players.length && rolesMatch;
  const alivePlayers = room?.players.filter(player => player.alive) ?? [];
  const announcedEliminations: Elimination[] = room?.announcement?.eliminations ?? (room?.announcement?.playerId && room.announcement.playerName ? [{ playerId: room.announcement.playerId, playerName: room.announcement.playerName, wasMafia: room.announcement.wasMafia === true }] : []);
  const showAnnouncement = !!room?.announcement && (["morning", "result", "game_over"] as Phase[]).includes(room.phase);

  return <div className="glow relative min-h-screen overflow-hidden"><div className="grain pointer-events-none absolute inset-0" /><div className="relative z-10">
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 border-b-2 border-foreground/40 px-4 py-5 sm:px-7">
      <button onClick={() => { if (!room) leave(); }} className="flex items-center gap-2.5" aria-label="Nookplay home"><span className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-foreground bg-primary text-[#16181d] shadow-[3px_3px_0_#ffe16a]"><Moon size={22} fill="currentColor" /></span><span className="display text-[26px] sm:text-[30px]">nookplay<span className="text-primary">.</span></span></button>
      <div className="flex items-center gap-2">{room ? <><span className="hidden text-xs font-black uppercase tracking-widest text-muted sm:block">Room</span><button onClick={copyInvite} className="flex items-center gap-2 rounded-xl border-2 border-foreground bg-card px-3 py-2 text-xs font-black tracking-[.16em] shadow-[3px_3px_0_#ff7da8] sm:text-sm">{room.code}{copied ? <Check size={15} /> : <Clipboard size={15} />}</button></> : <span className="rounded-xl border-2 border-primary px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary sm:text-xs">The game begins here</span>}</div>
    </header>

    {!session && <main className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-7 sm:px-7 lg:grid-cols-[1.1fr_.9fr] lg:gap-16 lg:pt-20"><div className="order-last lg:order-first"><p className="eyebrow mb-5 flex items-center gap-3"><span className="h-2 w-8 bg-gold" /> A game of trust & deception</p><h1 className="display max-w-[690px] text-[3.1rem] sm:text-[clamp(4rem,7vw,7.5rem)]">EVERY FRIEND HAS A <span className="text-primary">SECRET.</span></h1><p className="mt-7 max-w-[490px] text-base leading-8 text-muted sm:text-lg">Create a room. Deal the roles. Unmask the Mafia. The host runs the first game, while everyone follows along on their own device.</p><div className="mt-9 flex flex-wrap gap-3 text-xs font-black uppercase tracking-widest"><span className="chip"><Users size={15} /> 4–16 players</span><span className="chip"><LockKeyhole size={15} /> Private roles</span><span className="chip"><Sparkles size={15} /> No account</span></div></div><section className="panel order-first p-5 sm:p-8 lg:order-last">{recoverableHost && <div className="mb-6 rounded-xl border-2 border-gold bg-gold/10 p-4"><p className="text-sm font-black text-gold">Your host room {recoverableHost.code} is saved on this browser.</p><p className="mt-1 text-xs leading-5 text-muted">Closed the tab or left by mistake? Pick up where you stopped.</p><Button variant="gold" className="mt-3 w-full" onClick={resumeHost}>Resume hosting <ArrowRight size={16} /></Button></div>}<div className="mb-7 flex gap-2"><button className={`tab ${mode === "create" ? "tab-active" : ""}`} onClick={() => { setMode("create"); setError(""); }}>Create room</button><button className={`tab ${mode === "join" ? "tab-active" : ""}`} onClick={() => { setMode("join"); setError(""); }}>Join room</button></div><p className="eyebrow mb-2">{mode === "create" ? "Be the host" : "Enter the room"}</p><h2 className="display mb-6 text-3xl sm:text-4xl">{mode === "create" ? "SET THE STAGE." : "TAKE YOUR SEAT."}</h2><form onSubmit={event => { event.preventDefault(); void enter(mode); }} className="space-y-5"><div><label className="field-label" htmlFor="name">Your name</label><Input id="name" value={name} onChange={event => setName(event.target.value)} maxLength={22} required placeholder="What should we call you?" /></div>{mode === "create" ? <div><label className="field-label" htmlFor="capacity">Players in your room</label><select id="capacity" className="select" value={capacity} onChange={event => setCapacity(Number(event.target.value))}>{Array.from({ length: 13 }, (_, index) => index + 4).map(value => <option key={value} value={value}>{value} players</option>)}</select></div> : <div><label className="field-label" htmlFor="code">Room code</label><Input id="code" value={code} onChange={event => setCode(event.target.value.toUpperCase())} maxLength={6} required placeholder="ABC123" className="uppercase tracking-[.2em]" /></div>}<Button disabled={busy} className="w-full" size="lg" type="submit">{busy ? "One moment..." : mode === "create" ? "Create room" : "Join room"}<ArrowRight size={18} /></Button></form>{error && <p role="alert" className="error mt-4">{error}</p>}<p className="mt-6 text-xs leading-5 text-muted">Players get changes automatically. Your room is saved in Supabase.</p></section></main>}

    {session && !room && <main className="mx-auto max-w-6xl px-4 py-16 sm:px-7"><div className="panel max-w-lg p-8"><p className="eyebrow mb-2">Connecting</p><h1 className="display text-3xl">FINDING YOUR ROOM...</h1>{error && <><p role="alert" className="error mt-5">{error}</p><Button variant="outline" className="mt-5" onClick={leave}>Back to home</Button></>}</div></main>}

    {room && <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-7 sm:pt-12"><div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow mb-3">Round {room.round} <span className="mx-2 text-primary">✳</span> {room.viewer.host ? "Host control" : "Player view"}</p><h1 className="display text-4xl uppercase sm:text-6xl">{phaseLabel(room.phase)}<span className="text-primary">.</span></h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted">{room.phase === "lobby" ? room.viewer.host ? "Set roles, assign each player, then reveal their identities." : "You are in. The host is preparing the roles." : room.phase === "reveal" ? "The host dealt the cards. Keep your identity secret." : room.phase === "game_over" ? "The game has ended." : "The host guides this round. Watch for their announcement."}</p></div><div className="flex flex-wrap gap-2"><span className="chip"><Users size={15} /> {room.players.length}/{room.capacity} joined</span><button className="chip hover:bg-white/10" onClick={leave}><RotateCcw size={14} /> {room.viewer.host ? "Back to home" : "Leave room"}</button></div></div>
      {error && <div role="alert" className="error mb-6 flex items-start justify-between gap-3">{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></div>}

      {room.phase === "lobby" && <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]"><section className="panel overflow-hidden"><div className="panel-head"><div><p className="eyebrow mb-1">01 / Who is here</p><h2 className="display text-2xl sm:text-3xl">THE PLAYERS</h2></div><Users className="text-gold" size={25} /></div><div className="p-4 sm:p-6">{room.viewer.host && <p className="mb-4 text-sm text-muted">You are the host. Only players who join receive roles.</p>}<div className="space-y-2">{room.players.map((player) => <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-foreground/50 bg-[#171a20] p-3" key={player.id}><span className="avatar">{player.name.charAt(0).toUpperCase()}</span><span className="min-w-0 flex-1 truncate font-bold">{player.name}{player.id === room.viewer.id && <span className="ml-2 text-xs text-gold">You</span>}</span>{room.viewer.host && <div className="flex w-full basis-full items-center gap-2 sm:w-auto sm:basis-auto"><select aria-label={`Assign ${player.name} a role`} className="select !h-9 flex-1 text-xs sm:!w-40" value={player.roleId ?? ""} disabled={busy || rolesDirty} onChange={event => void hostAction("assign", { playerId: player.id, roleId: event.target.value || null })}><option value="">Choose role</option>{room.roles.map(role => <option key={role.id} value={role.id}>{role.name} · {role.team}</option>)}</select><button aria-label={`Remove ${player.name}`} title="Remove player" className="rounded-xl border-2 border-foreground p-2 text-muted hover:text-primary" onClick={() => void hostAction("remove", { playerId: player.id })}><X size={16} /></button></div>}</div>)}</div>{room.viewer.host && <div className="mt-5 rounded-xl border-2 border-gold bg-gold/10 p-4 text-sm leading-6"><strong className="block text-gold">Host checklist</strong><span className="text-muted">{room.players.length < 4 ? `Wait for ${4 - room.players.length} more players. ` : "Minimum players joined. "}{room.players.length >= 4 && roleTotal !== room.players.length ? `Set role quantities to ${room.players.length} total before reveal. ` : `Role setup has ${roleTotal} slots. `}{assignedCount}/{room.players.length} players assigned.</span></div>}</div></section>
      {room.viewer.host ? <section className="panel overflow-hidden"><div className="panel-head"><div><p className="eyebrow mb-1">02 / Host setup</p><h2 className="display text-2xl sm:text-3xl">ROLES & ASSIGNMENTS</h2></div><Shield className="text-primary" size={25} /></div><div className="space-y-3 p-4 sm:p-6"><p className="text-sm leading-6 text-muted">Name each role, choose its team and ability, and set its quantity. Save changes, then assign each player from the list.</p>{rolesDraft.map(role => <div className="rounded-xl border-2 border-foreground/60 bg-[#171a20] p-3 sm:p-4" key={role.id}><div className="mb-3 flex items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-foreground bg-primary text-[#17191f]">{iconFor(role.ability)}</span><Input aria-label="Role name" value={role.name} maxLength={22} onChange={event => editRole(role.id, { name: event.target.value })} className="!h-9 !min-w-0 font-bold" /><button aria-label={`Remove ${role.name}`} className="p-1 text-muted hover:text-primary" onClick={() => { setRolesDraft(current => current.filter(item => item.id !== role.id)); setRolesDirty(true); }}><Trash2 size={17} /></button></div><div className="grid grid-cols-[1fr_1.3fr_74px] gap-2"><select aria-label={`${role.name} team`} className="select !h-9 !px-2 text-xs" value={role.team} onChange={event => editRole(role.id, { team: event.target.value as Team })}><option>Mafia</option><option>Town</option></select><select aria-label={`${role.name} ability`} className="select !h-9 !px-2 text-xs" value={role.ability} onChange={event => editRole(role.id, { ability: event.target.value as Ability })}><option value="night_vote">Night vote</option><option value="inspect">Inspect</option><option value="protect">Protect</option><option value="none">None</option></select><Input aria-label={`${role.name} quantity`} type="number" min={0} max={16} value={role.count} onChange={event => editRole(role.id, { count: Math.min(16, Math.max(0, Number(event.target.value) || 0)) })} className="!h-9 !px-2 text-center" /></div></div>)}<div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => { setRolesDraft(current => [...current, { id: crypto.randomUUID(), name: "New role", team: "Town", ability: "none", count: 0 }]); setRolesDirty(true); }}><Plus size={15} /> Add role</Button><Button variant="gold" size="sm" disabled={!rolesDirty || busy} onClick={() => void hostAction("roles", { roles: rolesDraft })}>Save roles <Check size={15} /></Button></div><div className="border-t-2 border-foreground/50 pt-5"><p className="field-label">Deal the cards</p><p className="mb-3 text-sm text-muted">Assign roles one by one above, or shuffle them automatically.</p><Button variant="outline" className="w-full" disabled={busy || rolesDirty || roleTotal !== room.players.length} onClick={() => void hostAction("shuffle")}><Shuffle size={16} /> Randomly assign all</Button></div><Button className="w-full" size="lg" disabled={busy || !canReveal} onClick={() => void hostAction("reveal")}>Reveal roles to players <ArrowRight size={17} /></Button></div></section> : <section className="panel flex flex-col items-center justify-center p-8 text-center"><div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border-2 border-foreground bg-gold text-[#17191f] shadow-[6px_6px_0_#ff7da8]"><LockKeyhole size={41} /></div><p className="eyebrow mb-3">You&apos;re in, {room.viewer.name}</p><h2 className="display text-3xl sm:text-4xl">WAITING FOR THE HOST.</h2><p className="mt-4 max-w-sm text-sm leading-7 text-muted">Keep this page open. When the host reveals roles, your private card appears here automatically. No refresh needed.</p><div className="mt-6 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gold"><span className="h-2 w-2 animate-pulse rounded-full bg-gold" /> Live updates on</div></section>}</div>}

      {room.phase === "reveal" && <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><section className="panel p-5 sm:p-8"><p className="eyebrow mb-2">For your eyes only</p><h2 className="display mb-6 text-2xl sm:text-3xl">YOUR SECRET CARD</h2>{room.viewer.host ? <div className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border-2 border-gold bg-gold/10 p-7 text-center sm:min-h-[430px]"><LockKeyhole size={44} className="mb-6 text-gold" /><h3 className="display text-3xl uppercase">CARDS DELIVERED.</h3><p className="mt-4 max-w-sm text-sm leading-7 text-muted">Each player can privately reveal their role on their own device. Ask everyone to confirm before starting the night.</p></div> : <div className="reveal-card flex min-h-[360px] select-none flex-col items-center justify-center rounded-xl border-2 border-foreground p-7 text-center text-[#17191f] shadow-[7px_7px_0_#ff7da8] sm:min-h-[430px]" onPointerDown={holdReveal} onPointerUp={releaseReveal} onPointerCancel={releaseReveal} onPointerLeave={releaseReveal} onContextMenu={event => event.preventDefault()}><div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#17191f] bg-white/20">{revealed ? iconFor(room.viewer.role?.ability ?? "none") : <EyeOff size={34} />}</div>{revealed && room.viewer.role ? <><p className="text-xs font-black uppercase tracking-[.2em]">You are the</p><h3 className="display mt-2 break-words text-4xl uppercase sm:text-6xl">{room.viewer.role.name}</h3><p className="mt-4 text-sm font-bold">Team {room.viewer.role.team} · {abilityLabels[room.viewer.role.ability]}</p><Button variant="outline" className="mt-7" onPointerDown={event => event.stopPropagation()} onClick={() => setRevealed(false)}>Hide card <EyeOff size={16} /></Button></> : <><h3 className="display text-3xl uppercase sm:text-4xl">A SECRET AWAITS.</h3><p className="mt-3 text-sm font-semibold">Press and hold to see your role.</p></>}</div>}</section><section className="panel h-fit p-6 sm:p-8"><p className="eyebrow mb-3">Host coordination</p><h2 className="display text-2xl sm:text-3xl">READY FOR NIGHT?</h2><p className="mt-4 text-sm leading-7 text-muted">Players see only their own cards. Ask everyone to confirm they have seen their role, then start the first round.</p>{room.viewer.host && <Button className="mt-7 w-full" onClick={() => void hostAction("advance")} disabled={busy}>Begin night <Moon size={17} /></Button>}</section></div>}

      {!(["lobby", "reveal"] as Phase[]).includes(room.phase) && <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><div className="space-y-5"><section className="panel p-6 sm:p-9"><div className="mb-7 flex items-center gap-4"><span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border-2 border-foreground bg-gold text-[#17191f] shadow-[4px_4px_0_#ff7da8]">{room.phase === "night" ? <Moon size={31} /> : room.phase === "voting" ? <Vote size={31} /> : <Sun size={31} />}</span><div><p className="eyebrow mb-1">Round {room.round}</p><h2 className="display text-2xl uppercase sm:text-4xl">{phaseLabel(room.phase)}</h2></div></div>{room.winner && <div className="rounded-xl border-2 border-gold bg-gold/10 p-5"><p className="eyebrow mb-2 text-gold">Victory</p><p className="display text-3xl uppercase">{room.winner} wins!</p></div>}{showAnnouncement && room.announcement && <div className="rounded-xl border-2 border-primary bg-primary/10 p-5"><p className="eyebrow mb-2 text-primary">{room.announcement.kind === "night" ? "Night announcement" : "Vote result"}</p>{room.announcement.noElimination ? <p className="text-lg font-bold">No one was eliminated.</p> : <ul className="space-y-2">{announcedEliminations.map(player => <li key={player.playerId} className="text-sm"><strong className="text-lg">{player.playerName}</strong> was eliminated · {player.wasMafia ? "Mafia" : "not Mafia"}</li>)}</ul>}</div>}{room.phase === "night" && <p className="text-sm leading-7 text-muted">The host coordinates night actions offline for this first version, then announces who was lost when morning comes.</p>}{room.phase === "voting" && <p className="text-sm leading-7 text-muted">Discuss and vote together. The host counts the votes and records the result here.</p>}{room.phase === "discussion" && <p className="text-sm leading-7 text-muted">Talk it through. Ask questions, make your case, and decide who you trust. The host moves to voting when everyone is ready.</p>}{room.phase === "game_over" && !room.winner && <p className="text-sm leading-7 text-muted">The host ended this game.</p>}</section>
      {room.viewer.host && room.phase !== "game_over" && <section className="panel p-6 sm:p-8"><p className="eyebrow mb-2">Host only</p><h3 className="display mb-4 text-2xl uppercase">CONTROL THIS ROUND</h3>{(room.phase === "night" || room.phase === "voting") ? <><p className="mb-4 text-sm leading-6 text-muted">{room.phase === "night" ? "Select everyone eliminated overnight after coordinating actions, or leave all unchecked for no elimination." : "Select everyone voted out. Their Mafia status is announced from their assigned roles."} The result appears on every device.</p><fieldset><legend className="field-label">Eliminate players</legend><div className="space-y-2">{alivePlayers.map(player => <label key={player.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 ${selectedPlayers.includes(player.id) ? "border-primary bg-primary/10" : "border-foreground/50 bg-[#171a20]"}`}><input type="checkbox" className="h-5 w-5 shrink-0 accent-[#ff7da8]" checked={selectedPlayers.includes(player.id)} onChange={() => toggleElimination(player.id)} disabled={busy} /><span className="min-w-0 flex-1 font-bold">{player.name}</span><span className="text-xs text-muted">{room.roles.find(role => role.id === player.roleId)?.name ?? "Unknown"}</span></label>)}</div></fieldset><p className="mt-3 text-xs text-muted">{selectedPlayers.length ? `${selectedPlayers.length} selected. Everyone selected is marked out together.` : "None selected means no elimination or a tie."}</p><Button className="mt-5 w-full" disabled={busy} onClick={() => void hostAction("resolve", { kind: room.phase === "night" ? "night" : "vote", playerIds: selectedPlayers })}>{selectedPlayers.length ? `Eliminate ${selectedPlayers.length} & announce` : "Announce no elimination"} <ArrowRight size={17} /></Button></> : <><p className="mb-5 text-sm leading-6 text-muted">{room.phase === "morning" ? "After everyone sees the night result, begin discussion." : room.phase === "discussion" ? "When discussion is done, open voting." : `Round ${room.round} is complete. Start round ${room.round + 1} with a new night.`}</p><Button className="w-full" disabled={busy} onClick={() => void hostAction("advance")}>{room.phase === "morning" ? "Begin discussion" : room.phase === "discussion" ? "Open voting" : `Start round ${room.round + 1} · Night`} <ArrowRight size={17} /></Button></>}<Button variant="ghost" size="sm" className="mt-5" disabled={busy} onClick={() => { if (confirm("End this game for everyone?")) void hostAction("end"); }}>End game</Button></section>}</div><section className="panel h-fit overflow-hidden"><div className="panel-head"><div><p className="eyebrow mb-1">The room</p><h2 className="display text-2xl uppercase">WHO REMAINS?</h2></div><Users className="text-gold" /></div><div className="p-4 sm:p-6">{room.players.map(player => <div key={player.id} className="flex items-center gap-3 border-b border-foreground/30 py-3 last:border-0"><span className={`avatar ${!player.alive ? "!bg-[#4b4d53] !text-muted" : ""}`}>{player.name.charAt(0).toUpperCase()}</span><span className="min-w-0 flex-1"><span className={`block truncate font-semibold ${!player.alive ? "text-muted line-through" : ""}`}>{player.name}</span>{room.viewer.host && <span className="block truncate text-xs text-muted">{room.roles.find(role => role.id === player.roleId)?.name ?? "Unassigned"} · {room.roles.find(role => role.id === player.roleId)?.team ?? "No team"}</span>}</span><span className={`text-xs font-black uppercase tracking-wider ${player.alive ? "text-gold" : "text-muted"}`}>{player.alive ? "Alive" : "Out"}</span></div>)}</div>{room.phase !== "game_over" && <div className="border-t-2 border-foreground/40 p-5 text-xs leading-5 text-muted">Your screen updates automatically when the host changes the game.</div>}</section></div>}
    </main>}
    <footer className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 border-t-2 border-foreground/40 px-4 py-6 text-xs text-muted sm:px-7"><span>© Nookplay · Every friend has a secret</span><span>Host led game · Private cards · Live updates</span></footer>
  </div></div>;
}
