"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Clipboard, Eye, EyeOff, HeartPulse, LockKeyhole, Moon, Pause, Play, Plus, RotateCcw, Shield, Shuffle, Skull, Sun, Trash2, Users, Vote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Team = "Mafia" | "Town" | "Neutral";
type Ability = "night_vote" | "protect" | "inspect" | "none";
type Phase = "lobby" | "reveal" | "night" | "morning" | "discussion" | "voting" | "result" | "game_over";
type Settings = {
  nightSeconds: number; discussionSeconds: number; votingSeconds: number;
  revealRoles: "immediate" | "game_end" | "never"; tieRule: "none" | "revote";
  autoAdvance: boolean; spectatorJoin: boolean; actionMode: "guided" | "device";
};
type SettingsDraft = Settings & { capacity: number };
type Role = { id: string; name: string; team: Team; ability: Ability; count: number; objective: string };
type Player = { id: string; name: string; alive: boolean; spectator: boolean; roleId?: string | null; roleName?: string | null };
type Announcement = { kind: "night" | "vote"; noElimination: boolean; eliminations: Array<{ playerId: string; playerName: string; roleName?: string | null }> };
type Session = { code: string; token: string; playerId: string; pending?: boolean };
type RoomView = {
  code: string; capacity: number; phase: Phase; round: number; revision: number;
  expiresAt: number; phaseEndsAt: number | null; paused: boolean; remainingMs: number | null;
  voteRound: number; tieNotice: boolean; settings: Settings; players: Player[]; roles: Role[];
  announcement: Announcement | null; winner: string | null; readyCount: number;
  hostState?: { nightActions: Record<string, string>; inspections: Record<string, { targetId: string; wasMafia: boolean }>;
    votesSubmitted: string[]; voteCounts: Record<string, number> | null;
    pendingReclaims: Array<{ id: string; playerId: string; name: string }> };
  viewer: { id: string; name: string; host: boolean; alive: boolean; spectator: boolean; role: Role | null;
    ready: boolean; eligibleNightTargetIds: string[]; nightActionTargetId: string | null; voteSubmitted: boolean;
    inspectionResult: { targetName: string; wasMafia: boolean } | null };
};
type PendingView = { code: string; pending: true; expiresAt: number; viewer: { id: string; name: string; host: false } };
type View = RoomView | PendingView;
const sessionKey = "nookplay-session-v2";
const hostKey = "nookplay-host-session-v1";
const playerKeys = "nookplay-player-sessions-v1";
const initialSettings: SettingsDraft = { capacity: 6, nightSeconds: 120, discussionSeconds: 300, votingSeconds: 120, revealRoles: "never", tieRule: "none", autoAdvance: false, spectatorJoin: false, actionMode: "guided" };
const abilityText: Record<Ability, string> = { night_vote: "Night target", protect: "Protect", inspect: "Inspect", none: "No action" };
const phaseText: Record<Phase, string> = { lobby: "Waiting room", reveal: "Secret reveal", night: "Night falls", morning: "Morning result", discussion: "Discussion", voting: "The vote", result: "Vote result", game_over: "Game over" };
function isRoom(view: View | null): view is RoomView { return !!view && "phase" in view; }
function iconFor(ability: Ability) { return ability === "night_vote" ? <Skull size={19} /> : ability === "protect" ? <HeartPulse size={19} /> : ability === "inspect" ? <Eye size={19} /> : <Users size={19} />; }
function clock(ms: number) { const seconds = Math.ceil(Math.max(0, ms) / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
function savedPlayers(): Record<string, Session> { try { return JSON.parse(localStorage.getItem(playerKeys) || "{}") as Record<string, Session>; } catch { return {}; } }
function rememberPlayer(session: Session) { localStorage.setItem(playerKeys, JSON.stringify({ ...savedPlayers(), [session.code]: session })); }
function forgetPlayer(code: string) { const all = savedPlayers(); delete all[code]; localStorage.setItem(playerKeys, JSON.stringify(all)); }

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [capacity, setCapacity] = useState(6);
  const [returning, setReturning] = useState<{ session: Session; name: string } | null>(null);
  const [recoverableHost, setRecoverableHost] = useState<Session | null>(null);
  const [duplicateName, setDuplicateName] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(initialSettings);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [rolesDraft, setRolesDraft] = useState<Role[]>([]);
  const [rolesDirty, setRolesDirty] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [manualOverride, setManualOverride] = useState(false);
  const [customWinner, setCustomWinner] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef<Session | null>(null);
  const room = isRoom(view) ? view : null;

  useEffect(() => {
    try {
      const host = JSON.parse(localStorage.getItem(hostKey) || "null") as Session | null;
      if (host?.token) setRecoverableHost(host);
      const stored = JSON.parse(sessionStorage.getItem(sessionKey) || "null") as Session | null;
      const active = stored?.token ? stored : host?.token ? host : null;
      if (active) { activeRef.current = active; setSession(active); }
    } catch { /* Browser storage may have been cleared. */ }
    const joinCode = new URLSearchParams(location.search).get("join");
    if (joinCode) { setMode("join"); setCode(joinCode.toUpperCase().slice(0, 6)); }
  }, []);
  useEffect(() => { const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, []);

  const loadRoom = useCallback(async (current: Session) => {
    try {
      const response = await fetch(`/api/rooms/${current.code}`, { headers: { "x-room-token": current.token }, cache: "no-store" });
      const data = await response.json();
      if (activeRef.current?.token !== current.token) return;
      if (!response.ok) {
        if ([401, 404, 410].includes(response.status)) {
          sessionStorage.removeItem(sessionKey);
          if (current.playerId === "host") { localStorage.removeItem(hostKey); setRecoverableHost(null); }
          else forgetPlayer(current.code);
          activeRef.current = null; setSession(null); setView(null);
        }
        throw new Error(data.error || "Could not load the room.");
      }
      setView(previous => !isRoom(previous) || !isRoom(data) || data.revision >= previous.revision ? data as View : previous);
      setError("");
      if (current.playerId === "host") { localStorage.setItem(hostKey, JSON.stringify(current)); setRecoverableHost(current); }
      else if (!(data as PendingView).pending) rememberPlayer(current);
    } catch (reason) { if (activeRef.current?.token === current.token || !activeRef.current) setError(reason instanceof Error ? reason.message : "Connection lost."); }
  }, []);
  useEffect(() => {
    if (!session) return;
    void loadRoom(session);
    const interval = setInterval(() => void loadRoom(session), 2000);
    return () => clearInterval(interval);
  }, [session, loadRoom]);
  useEffect(() => {
    if (room && !settingsDirty) setSettingsDraft({ ...room.settings, capacity: room.capacity });
    if (room && !rolesDirty) setRolesDraft(room.roles);
  }, [room, settingsDirty, rolesDirty]);
  useEffect(() => { setRevealed(false); setSelectedPlayers([]); setSelectedTarget(""); setManualOverride(false); }, [room?.phase]);

  useEffect(() => {
    if (mode !== "join" || code.length !== 6 || session) { setReturning(null); return; }
    const saved = savedPlayers()[code.toUpperCase()];
    if (!saved) { setReturning(null); return; }
    let cancelled = false;
    void fetch(`/api/rooms/${code}`, { headers: { "x-room-token": saved.token }, cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (cancelled) return;
      if (response.ok && data.viewer?.name && !data.pending) setReturning({ session: saved, name: data.viewer.name });
      else { forgetPlayer(code); setReturning(null); if (response.status === 410) setError("This room expired after 24 hours."); }
    }).catch(() => { if (!cancelled) setReturning(null); });
    return () => { cancelled = true; };
  }, [code, mode, session]);

  function activate(next: Session) {
    sessionStorage.setItem(sessionKey, JSON.stringify(next));
    if (next.playerId === "host") { localStorage.setItem(hostKey, JSON.stringify(next)); setRecoverableHost(next); }
    else rememberPlayer(next);
    activeRef.current = next; setSession(next); setView(null); setError(""); setDuplicateName(false);
    history.replaceState(null, "", "/");
  }
  async function enter(action: "create" | "join" | "reclaim") {
    setBusy(true); setError(""); setDuplicateName(false);
    try {
      const response = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, name, code, capacity }) });
      const data = await response.json();
      if (!response.ok) { if (response.status === 409 && String(data.error).includes("name is already")) setDuplicateName(true); throw new Error(data.error || "Could not enter the room."); }
      activate(data as Session);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not enter the room."); }
    finally { setBusy(false); }
  }
  async function act(action: string, payload: Record<string, unknown> = {}) {
    if (!session) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/rooms/${session.code}`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-room-token": session.token }, body: JSON.stringify({ action, ...payload }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update the room.");
      if (activeRef.current?.token === session.token) setView(previous => !isRoom(previous) || !isRoom(data) || data.revision >= previous.revision ? data as View : previous);
      if (action === "roles") setRolesDirty(false);
      if (action === "settings") setSettingsDirty(false);
      setSelectedPlayers([]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the room."); }
    finally { setBusy(false); }
  }
  async function deleteRoom() {
    if (!session || !confirm("Delete this room for everyone? This cannot be undone.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/rooms/${session.code}`, { method: "DELETE", headers: { "x-room-token": session.token } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not delete the room.");
      localStorage.removeItem(hostKey); setRecoverableHost(null); leave(); setError("Room deleted. Its code no longer works.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete the room."); }
    finally { setBusy(false); }
  }
  function leave() { activeRef.current = null; sessionStorage.removeItem(sessionKey); setSession(null); setView(null); setRolesDirty(false); setSettingsDirty(false); setError(""); }
  function resumeHost() { if (recoverableHost) activate(recoverableHost); }
  async function copyInvite() { if (!room) return; try { await navigator.clipboard.writeText(`${location.origin}/?join=${room.code}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError("Copy failed. Share the room code instead."); } }
  function editRole(id: string, changes: Partial<Role>) { setRolesDraft(current => current.map(role => role.id === id ? { ...role, ...changes } : role)); setRolesDirty(true); }
  function editSettings(changes: Partial<SettingsDraft>) { setSettingsDraft(current => ({ ...current, ...changes })); setSettingsDirty(true); }
  function togglePlayer(id: string) { setSelectedPlayers(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); }
  function holdReveal() { revealTimer.current = setTimeout(() => setRevealed(true), 700); }
  function releaseReveal() { if (revealTimer.current) clearTimeout(revealTimer.current); }

  const activePlayers = room?.players.filter(player => !player.spectator) ?? [];
  const livingPlayers = activePlayers.filter(player => player.alive);
  const roleTotal = rolesDraft.reduce((sum, role) => sum + role.count, 0);
  const assigned = activePlayers.filter(player => player.roleId).length;
  const rolesMatch = !!room && room.roles.every(role => activePlayers.filter(player => player.roleId === role.id).length === role.count);
  const canReveal = !!room && activePlayers.length >= 4 && !rolesDirty && room.roles.reduce((sum, role) => sum + role.count, 0) === activePlayers.length && rolesMatch;
  const remaining = room?.paused ? room.remainingMs ?? 0 : room?.phaseEndsAt ? Math.max(0, room.phaseEndsAt - now) : null;
  const pending = view && !isRoom(view) ? view : null;
  const showAnnouncement = !!room && (["morning", "result", "game_over"] as Phase[]).includes(room.phase) && room.announcement;
  const nightActors = livingPlayers.filter(player => room?.roles.find(role => role.id === player.roleId)?.ability !== "none");
  const ownAbility = room?.viewer.role?.ability ?? "none";
  const actionTargets = livingPlayers.filter(player => room?.phase === "night" ? room.viewer.eligibleNightTargetIds.includes(player.id) : player.id !== room?.viewer.id);

  return <div className="glow relative min-h-screen overflow-hidden"><div className="grain pointer-events-none absolute inset-0" /><div className="relative z-10">
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 border-b-2 border-foreground/40 px-4 py-5 sm:px-7">
      <button onClick={() => { if (!session) leave(); }} className="flex items-center gap-2.5" aria-label="Nookplay home"><span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-primary text-[#16181d] shadow-[3px_3px_0_#ffe16a]"><Moon size={22} fill="currentColor" /></span><span className="display text-[26px] sm:text-[30px]">nookplay<span className="text-primary">.</span></span></button>
      {room ? <button onClick={copyInvite} className="flex items-center gap-2 border-2 border-foreground bg-card px-3 py-2 text-xs font-black tracking-[.16em] shadow-[3px_3px_0_#ff7da8] sm:text-sm">{room.code}{copied ? <Check size={15} /> : <Clipboard size={15} />}</button> : <span className="border-2 border-primary px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary sm:text-xs">The game begins here</span>}
    </header>

    {!session && <main className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-7 sm:px-7 lg:grid-cols-[1.1fr_.9fr] lg:gap-16 lg:pt-20">
      <div className="order-last lg:order-first"><p className="eyebrow mb-5">✳ A game of trust & deception</p><h1 className="display max-w-[690px] text-[3.1rem] sm:text-[clamp(4rem,7vw,7.5rem)]">EVERY FRIEND HAS A <span className="text-primary">SECRET.</span></h1><p className="mt-7 max-w-[490px] text-base leading-8 text-muted sm:text-lg">Gather around. The host runs the room, while private roles and dramatic results stay in everyone&apos;s pocket.</p><div className="mt-9 flex flex-wrap gap-3 text-xs font-black uppercase tracking-widest"><span className="chip"><Users size={15} /> 4–16 players</span><span className="chip"><LockKeyhole size={15} /> Private roles</span><span className="chip"><Moon size={15} /> Host guided</span></div></div>
      <section className="panel order-first p-5 sm:p-8 lg:order-last">
        {recoverableHost && <div className="mb-6 border-2 border-gold bg-gold/10 p-4"><p className="font-black text-gold">HOST ROOM {recoverableHost.code} IS SAVED.</p><p className="mt-1 text-xs text-muted">Closed the tab or left by mistake? Continue from this browser.</p><Button variant="gold" className="mt-3 w-full" onClick={resumeHost}>Resume hosting <ArrowRight size={16} /></Button></div>}
        <div className="mb-7 flex gap-2"><button className={`tab ${mode === "create" ? "tab-active" : ""}`} onClick={() => { setMode("create"); setError(""); }}>Create room</button><button className={`tab ${mode === "join" ? "tab-active" : ""}`} onClick={() => { setMode("join"); setError(""); }}>Join room</button></div>
        <p className="eyebrow mb-2">{mode === "create" ? "Be the host" : "Enter the room"}</p><h2 className="display mb-6 text-3xl sm:text-4xl">{mode === "create" ? "SET THE STAGE." : "TAKE YOUR SEAT."}</h2>
        {mode === "join" && <div className="mb-5"><label className="field-label" htmlFor="code">Room code</label><Input id="code" value={code} onChange={event => { setCode(event.target.value.toUpperCase()); setError(""); }} maxLength={6} placeholder="ABC123" className="uppercase tracking-[.2em]" /></div>}
        {mode === "join" && returning && <div className="mb-5 border-2 border-gold bg-gold/10 p-4"><p className="font-black text-gold">CONTINUE AS {returning.name}?</p><p className="mt-1 text-xs text-muted">Your private seat is saved in this browser.</p><Button variant="gold" className="mt-3 w-full" onClick={() => activate(returning.session)}>Continue game <ArrowRight size={16} /></Button></div>}
        <form onSubmit={event => { event.preventDefault(); void enter(mode); }} className="space-y-5"><div><label className="field-label" htmlFor="name">Your name</label><Input id="name" value={name} onChange={event => { setName(event.target.value.toUpperCase()); setDuplicateName(false); }} maxLength={22} required placeholder="WHAT SHOULD WE CALL YOU?" className="uppercase" /></div>{mode === "create" && <div><label className="field-label" htmlFor="capacity">Player limit</label><select id="capacity" className="select" value={capacity} onChange={event => setCapacity(Number(event.target.value))}>{Array.from({ length: 13 }, (_, index) => index + 4).map(value => <option key={value} value={value}>{value} players</option>)}</select></div>}<Button disabled={busy || (mode === "join" && code.length !== 6)} className="w-full" size="lg" type="submit">{busy ? "One moment..." : mode === "create" ? "Create room" : "Join room"}<ArrowRight size={18} /></Button></form>
        {duplicateName && <Button variant="outline" className="mt-4 w-full" disabled={busy} onClick={() => void enter("reclaim")}>Ask host to restore {name} <Shield size={16} /></Button>}
        {error && <p role="alert" className="error mt-4">{error}</p>}
        <p className="mt-6 text-xs leading-5 text-muted">Names appear in capitals. Rooms close after 24 hours.</p>
      </section>
    </main>}

    {session && !view && <main className="mx-auto max-w-6xl px-4 py-16 sm:px-7"><div className="panel max-w-lg p-8"><p className="eyebrow mb-2">Connecting</p><h1 className="display text-3xl">FINDING YOUR ROOM...</h1>{error && <><p role="alert" className="error mt-5">{error}</p><Button variant="outline" className="mt-5" onClick={leave}>Back to home</Button></>}</div></main>}
    {session && pending && <main className="mx-auto max-w-6xl px-4 py-16 sm:px-7"><section className="panel max-w-xl p-7 sm:p-10"><Shield className="mb-5 text-gold" size={36} /><p className="eyebrow mb-2">Identity recovery</p><h1 className="display text-3xl sm:text-4xl">WAITING FOR THE HOST.</h1><p className="mt-4 leading-7 text-muted">You asked to return as <strong className="text-foreground">{pending.viewer.name}</strong> in room {pending.code}. The host must approve before this device can see that player&apos;s role.</p><Button variant="outline" className="mt-6" onClick={leave}>Back to home</Button></section></main>}

    {session && room && <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-7 sm:pt-12">
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow mb-3">Round {room.round} <span className="mx-2 text-primary">✳</span> {room.viewer.host ? "Host control" : room.viewer.spectator ? "Spectator view" : "Player view"}</p><h1 className="display text-4xl uppercase sm:text-6xl">{phaseText[room.phase]}<span className="text-primary">.</span></h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted">{room.phase === "lobby" ? room.viewer.host ? "Set the room, deal the roles, and begin when everyone is ready." : "Waiting for the host to start the next game." : room.phase === "reveal" ? "Each player sees only their own card." : room.phase === "game_over" ? "The game has ended. The host can bring everyone back to the waiting room." : room.settings.actionMode === "guided" ? "Look up from your phone. The host guides this round." : "Submit private actions on your device. The host keeps the game moving."}</p></div><div className="flex flex-wrap gap-2"><span className="chip text-xs font-black"><Users size={15} /> {activePlayers.length}/{room.capacity} players</span><span className="chip text-xs font-black"><Moon size={15} /> {clock(room.expiresAt - now)} left</span><button className="chip text-xs font-black hover:bg-white/10" onClick={leave}><RotateCcw size={14} /> {room.viewer.host ? "Back to home" : "Leave view"}</button></div></div>
      {error && <div role="alert" className="error mb-6 flex items-start justify-between gap-3">{error}<button onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></div>}
      {room.viewer.host && !!room.hostState?.pendingReclaims.length && <section className="panel mb-6 p-5 sm:p-6"><p className="eyebrow mb-2">Host approval</p><h2 className="display text-2xl">PLAYERS ASKING TO RETURN</h2><div className="mt-4 space-y-3">{room.hostState.pendingReclaims.map(claim => <div className="flex flex-wrap items-center gap-3 border-2 border-foreground/40 bg-[#171a20] p-3" key={claim.id}><span className="min-w-0 flex-1 font-black">{claim.name}</span><Button size="sm" disabled={busy} onClick={() => void act("approve_reclaim", { claimId: claim.id })}>Approve</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void act("reject_reclaim", { claimId: claim.id })}>Reject</Button></div>)}</div><p className="mt-3 text-xs text-muted">Approving moves this player&apos;s identity to the new device and ends access on the old one.</p></section>}

      {room.phase === "lobby" && <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-5"><section className="panel overflow-hidden"><div className="panel-head"><div><p className="eyebrow mb-1">01 / The room</p><h2 className="display text-2xl sm:text-3xl">WHO IS HERE?</h2></div><Users className="text-gold" /></div><div className="space-y-2 p-4 sm:p-6">{room.players.length === 0 && <p className="text-sm text-muted">Share your code or invite link. Players appear here as they join.</p>}{room.players.map(player => <div className="flex flex-wrap items-center gap-3 border-2 border-foreground/40 bg-[#171a20] p-3" key={player.id}><span className="avatar">{player.name.charAt(0)}</span><span className="min-w-0 flex-1 truncate font-black">{player.name}{player.spectator && <span className="ml-2 text-xs text-gold">Spectator</span>}</span>{room.viewer.host && <div className="flex w-full basis-full items-center gap-2 sm:w-auto sm:basis-auto">{player.spectator ? <Button size="sm" variant="gold" disabled={busy || activePlayers.length >= room.capacity} onClick={() => void act("promote", { playerId: player.id })}>Add player</Button> : <select aria-label={`Assign ${player.name} a role`} className="select !h-9 flex-1 text-xs sm:!w-40" value={player.roleId ?? ""} disabled={busy || rolesDirty} onChange={event => void act("assign", { playerId: player.id, roleId: event.target.value || null })}><option value="">Choose role</option>{room.roles.map(role => <option key={role.id} value={role.id}>{role.name} · {role.team}</option>)}</select>}<button aria-label={`Remove ${player.name}`} className="border-2 border-foreground p-2 text-muted hover:text-primary" onClick={() => void act("remove", { playerId: player.id })}><X size={16} /></button></div>}</div>)}{room.viewer.host && <div className="mt-4 border-2 border-gold bg-gold/10 p-4 text-sm"><strong className="text-gold">HOST CHECKLIST</strong><p className="mt-1 text-muted">{activePlayers.length} joined · {assigned} assigned · {roleTotal} role slots. The counts and assignments must match before reveal.</p></div>}</div></section>
          {room.viewer.host && <section className="panel overflow-hidden"><div className="panel-head"><div><p className="eyebrow mb-1">02 / Host settings</p><h2 className="display text-2xl sm:text-3xl">ROOM SETTINGS</h2></div><Shield className="text-primary" /></div><div className="space-y-4 p-4 sm:p-6"><div className="grid gap-3 sm:grid-cols-2"><div><label className="field-label" htmlFor="playerLimit">Player limit</label><select id="playerLimit" className="select" value={settingsDraft.capacity} onChange={event => editSettings({ capacity: Number(event.target.value) })}>{Array.from({ length: 13 }, (_, index) => index + 4).map(value => <option key={value} value={value} disabled={value < activePlayers.length}>{value}</option>)}</select></div><div><label className="field-label" htmlFor="actionMode">Actions and votes</label><select id="actionMode" className="select" value={settingsDraft.actionMode} onChange={event => editSettings({ actionMode: event.target.value as Settings["actionMode"] })}><option value="guided">Host guided · in person</option><option value="device">Private on device</option></select></div></div><p className="text-xs leading-5 text-muted">In host-guided mode, players keep their eyes on the group and you record outcomes. Device mode accepts private actions and votes.</p><div className="grid grid-cols-3 gap-2">{(["nightSeconds", "discussionSeconds", "votingSeconds"] as const).map(key => <div key={key}><label className="field-label !text-[10px]" htmlFor={key}>{key === "nightSeconds" ? "Night" : key === "discussionSeconds" ? "Talk" : "Vote"} (sec)</label><Input id={key} type="number" min={30} max={1800} step={30} value={settingsDraft[key]} onChange={event => editSettings({ [key]: Number(event.target.value) })} className="!px-2 text-center" /></div>)}</div><div className="grid gap-3 sm:grid-cols-2"><div><label className="field-label" htmlFor="revealRule">Reveal eliminated roles</label><select id="revealRule" className="select" value={settingsDraft.revealRoles} onChange={event => editSettings({ revealRoles: event.target.value as Settings["revealRoles"] })}><option value="never">Never · host only</option><option value="game_end">At game end</option><option value="immediate">Immediately</option></select></div><div><label className="field-label" htmlFor="tieRule">Tied vote</label><select id="tieRule" className="select" value={settingsDraft.tieRule} onChange={event => editSettings({ tieRule: event.target.value as Settings["tieRule"] })}><option value="none">No elimination</option><option value="revote">Revote</option></select></div></div><label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={settingsDraft.autoAdvance} onChange={event => editSettings({ autoAdvance: event.target.checked })} className="h-5 w-5 accent-[#ff7da8]" /> Auto advance when timers end</label><p className="-mt-2 text-xs text-muted">Auto resolution uses device actions. Host-guided nights and votes still wait for you.</p><label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={settingsDraft.spectatorJoin} onChange={event => editSettings({ spectatorJoin: event.target.checked })} className="h-5 w-5 accent-[#ff7da8]" /> Let spectators join after start</label><Button variant="gold" className="w-full" disabled={!settingsDirty || busy} onClick={() => void act("settings", { settings: settingsDraft })}>Save room settings <Check size={16} /></Button></div></section>}
        </div>
        {room.viewer.host ? <section className="panel h-fit overflow-hidden"><div className="panel-head"><div><p className="eyebrow mb-1">03 / The cast</p><h2 className="display text-2xl sm:text-3xl">ROLES & ASSIGNMENTS</h2></div><Skull className="text-primary" /></div><div className="space-y-3 p-4 sm:p-6"><p className="text-sm leading-6 text-muted">Every player needs one role. Use the four defaults or add a custom character. Neutral roles such as Joker are judged by the host.</p>{rolesDraft.map(role => <div className="border-2 border-foreground/50 bg-[#171a20] p-3" key={role.id}><div className="mb-3 flex items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-foreground bg-primary text-[#17191f]">{iconFor(role.ability)}</span><Input aria-label="Role name" value={role.name} maxLength={22} onChange={event => editRole(role.id, { name: event.target.value.toUpperCase() })} className="!h-9 !min-w-0 font-bold uppercase" /><button aria-label={`Remove ${role.name}`} onClick={() => { setRolesDraft(current => current.filter(item => item.id !== role.id)); setRolesDirty(true); }} className="p-1 text-muted hover:text-primary"><Trash2 size={17} /></button></div><div className="grid grid-cols-[1fr_1.1fr_65px] gap-2"><select aria-label={`${role.name} team`} className="select !h-9 !px-2 text-xs" value={role.team} onChange={event => editRole(role.id, { team: event.target.value as Team })}><option>Mafia</option><option>Town</option><option>Neutral</option></select><select aria-label={`${role.name} ability`} className="select !h-9 !px-2 text-xs" value={role.ability} onChange={event => editRole(role.id, { ability: event.target.value as Ability })}><option value="night_vote">Night target</option><option value="protect">Protect</option><option value="inspect">Inspect</option><option value="none">No action</option></select><Input aria-label={`${role.name} quantity`} type="number" min={0} max={16} value={role.count} onChange={event => editRole(role.id, { count: Number(event.target.value) || 0 })} className="!h-9 !px-1 text-center" /></div><Input aria-label={`${role.name} objective`} value={role.objective} maxLength={180} onChange={event => editRole(role.id, { objective: event.target.value })} placeholder="Role objective" className="mt-2 !h-9 text-xs" /></div>)}<div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { setRolesDraft(current => [...current, { id: crypto.randomUUID(), name: "CUSTOM ROLE", team: "Neutral", ability: "none", count: 0, objective: "Follow the custom rule agreed by your group." }]); setRolesDirty(true); }}><Plus size={15} /> Add custom role</Button><Button size="sm" variant="gold" disabled={!rolesDirty || busy} onClick={() => void act("roles", { roles: rolesDraft })}>Save roles <Check size={15} /></Button></div><div className="border-t-2 border-foreground/40 pt-4"><p className="field-label">Deal the cards</p><Button variant="outline" className="w-full" disabled={busy || rolesDirty || roleTotal !== activePlayers.length} onClick={() => void act("shuffle")}><Shuffle size={16} /> Randomize roles</Button></div><Button className="w-full" size="lg" disabled={busy || !canReveal} onClick={() => void act("reveal")}>Reveal roles to players <ArrowRight size={17} /></Button></div></section> : <section className="panel flex h-fit flex-col items-center justify-center p-8 text-center"><LockKeyhole size={44} className="mb-5 text-gold" /><p className="eyebrow mb-3">You&apos;re in, {room.viewer.name}</p><h2 className="display text-3xl sm:text-4xl">WAITING FOR THE HOST.</h2><p className="mt-4 max-w-sm text-sm leading-7 text-muted">Keep this page open. Your private card will appear when the host reveals roles. No refresh needed.</p></section>}
      </div>}

      {room.phase === "reveal" && <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><section className="panel p-5 sm:p-8"><p className="eyebrow mb-2">Private identity</p><h2 className="display mb-6 text-2xl sm:text-3xl">YOUR SECRET CARD</h2>{room.viewer.host ? <div className="flex min-h-[300px] flex-col items-center justify-center border-2 border-gold bg-gold/10 p-7 text-center"><LockKeyhole size={42} className="mb-5 text-gold" /><h3 className="display text-3xl">CARDS DELIVERED.</h3><p className="mt-3 text-sm text-muted">{room.readyCount}/{activePlayers.length} players marked ready. Ask everyone to check before starting the night.</p></div> : room.viewer.spectator ? <div className="border-2 border-gold bg-gold/10 p-6 text-center">You joined as a spectator. Watch the game and wait for the next lobby.</div> : <div className="reveal-card flex min-h-[340px] select-none flex-col items-center justify-center border-2 border-foreground p-7 text-center text-[#17191f] shadow-[7px_7px_0_#ff7da8]" onPointerDown={holdReveal} onPointerUp={releaseReveal} onPointerCancel={releaseReveal} onPointerLeave={releaseReveal} onContextMenu={event => event.preventDefault()}><div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#17191f] bg-white/20">{revealed ? iconFor(room.viewer.role?.ability ?? "none") : <EyeOff size={34} />}</div>{revealed && room.viewer.role ? <><p className="text-xs font-black uppercase tracking-[.2em]">You are</p><h3 className="display mt-2 break-words text-4xl uppercase sm:text-6xl">{room.viewer.role.name}</h3><p className="mt-3 text-sm font-bold">{room.viewer.role.team} · {abilityText[room.viewer.role.ability]}</p><p className="mt-4 max-w-sm text-sm">{room.viewer.role.objective}</p><Button variant="outline" className="mt-6" onPointerDown={event => event.stopPropagation()} onClick={() => setRevealed(false)}>Hide card <EyeOff size={16} /></Button></> : <><h3 className="display text-3xl">A SECRET AWAITS.</h3><p className="mt-3 text-sm font-semibold">Press and hold to see your role.</p></>}</div>}{!room.viewer.host && !room.viewer.spectator && <Button variant="gold" className="mt-6 w-full" disabled={busy || room.viewer.ready} onClick={() => void act("ready")}>{room.viewer.ready ? "Ready · waiting for host" : "I have seen my role"} <Check size={16} /></Button>}</section><section className="panel h-fit p-6 sm:p-8"><p className="eyebrow mb-3">Host coordination</p><h2 className="display text-2xl sm:text-3xl">READY FOR NIGHT?</h2><p className="mt-4 text-sm leading-7 text-muted">Players see only their own identities. Begin when the group is ready.</p>{room.viewer.host && <Button className="mt-7 w-full" onClick={() => void act("advance")} disabled={busy}>Begin night <Moon size={17} /></Button>}</section></div>}

      {!(["lobby", "reveal"] as Phase[]).includes(room.phase) && <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><div className="space-y-5"><section className="panel p-5 sm:p-8"><div className="mb-5 flex items-center gap-4"><span className="flex h-14 w-14 shrink-0 items-center justify-center border-2 border-foreground bg-gold text-[#17191f] shadow-[4px_4px_0_#ff7da8]">{room.phase === "night" ? <Moon size={27} /> : room.phase === "voting" ? <Vote size={27} /> : <Sun size={27} />}</span><div><p className="eyebrow mb-1">Round {room.round}{room.phase === "voting" && room.voteRound > 1 ? ` · Revote ${room.voteRound}` : ""}</p><h2 className="display text-2xl uppercase sm:text-4xl">{phaseText[room.phase]}</h2></div></div>{remaining !== null && <div className="mb-5 border-2 border-gold bg-gold/10 p-4"><p className="eyebrow mb-1">{room.paused ? "Timer paused" : remaining === 0 ? "Time is up" : "Time remaining"}</p><p className="display text-4xl tabular-nums text-gold">{clock(remaining)}</p></div>}{room.winner && <div className="border-2 border-gold bg-gold/10 p-5"><p className="eyebrow mb-2">Victory</p><p className="display text-3xl uppercase">{room.winner} wins!</p></div>}{showAnnouncement && room.announcement && <div className="border-2 border-primary bg-primary/10 p-5"><p className="eyebrow mb-2 text-primary">{room.announcement.kind === "night" ? "Morning announcement" : "Vote result"}</p>{room.announcement.noElimination ? <p className="text-lg font-bold">{room.announcement.kind === "night" ? "Nobody was eliminated during the night." : "Nobody was eliminated by the vote."}</p> : <ul className="space-y-3">{room.announcement.eliminations.map(player => <li key={player.playerId} className="text-sm leading-6"><strong className="text-lg">{player.playerName}</strong> was eliminated {room.announcement?.kind === "night" ? "during the night" : "by the vote"}.{player.roleName && <span className="block text-muted">Their role was {player.roleName}.</span>}</li>)}</ul>}</div>}{room.phase === "night" && <p className="text-sm leading-7 text-muted">Eyes closed. The host calls the Mafia, then Doctor, then Detective. When the city wakes, the host announces the result.</p>}{room.phase === "morning" && <p className="mt-4 text-sm leading-7 text-muted">The city wakes. Discuss what happened before voting.</p>}{room.phase === "discussion" && <p className="text-sm leading-7 text-muted">Talk face to face. Ask questions, make your case, and decide who you trust.</p>}{room.phase === "voting" && <p className="text-sm leading-7 text-muted">{room.tieNotice ? "The last vote was tied. Vote again." : "Choose who you suspect."} {room.settings.actionMode === "guided" ? "Tell the host your vote." : "Living players vote privately below."}</p>}{room.phase === "game_over" && !room.winner && <p className="text-sm leading-7 text-muted">The host ended this game.</p>}</section>

        {room.viewer.host && room.phase !== "game_over" && <section className="panel p-5 sm:p-8"><p className="eyebrow mb-2">Host only</p><h3 className="display mb-4 text-2xl uppercase">CONTROL THIS ROUND</h3>{remaining !== null && <div className="mb-5 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy || remaining === 0} onClick={() => void act(room.paused ? "resume" : "pause")}>{room.paused ? <Play size={15} /> : <Pause size={15} />}{room.paused ? "Resume" : "Pause"}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void act("extend", { seconds: 60 })}>+ 1 minute</Button></div>}
          {room.phase === "night" && <><p className="mb-4 text-sm leading-6 text-muted">Call each role in order. Record what they choose, then announce the outcome. Doctor protection is applied when you use the recorded actions.</p><div className="space-y-3">{nightActors.map(actor => { const role = room.roles.find(item => item.id === actor.roleId); const targets = livingPlayers.filter(player => player.id !== actor.id || role?.ability === "protect").filter(player => role?.ability !== "night_vote" || room.roles.find(item => item.id === player.roleId)?.team !== "Mafia"); return <div key={actor.id} className="border-2 border-foreground/40 bg-[#171a20] p-3"><div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><strong>{actor.name}</strong><span className="text-gold">{role?.name} · {role ? abilityText[role.ability] : ""}</span></div><select aria-label={`${actor.name} night target`} className="select !h-9 text-xs" value={room.hostState?.nightActions[actor.id] ?? ""} disabled={busy} onChange={event => void act("record_action", { actorId: actor.id, targetId: event.target.value })}><option value="">Choose target</option>{targets.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}</select>{role?.ability === "inspect" && room.hostState?.inspections[actor.id] && <p className="mt-2 text-xs text-gold">Inspection: {room.hostState.inspections[actor.id].wasMafia ? "MAFIA" : "NOT MAFIA"}</p>}</div>; })}</div><label className="mt-5 flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={manualOverride} onChange={event => setManualOverride(event.target.checked)} className="h-5 w-5 accent-[#ff7da8]" /> Use a manual outcome instead</label>{manualOverride && <EliminationChoices players={livingPlayers} roles={room.roles} selected={selectedPlayers} onToggle={togglePlayer} /> }<Button className="mt-5 w-full" disabled={busy} onClick={() => void act("resolve", { kind: "night", ...(manualOverride ? { playerIds: selectedPlayers } : {}) })}>Announce morning result <ArrowRight size={17} /></Button></>}
          {room.phase === "morning" && <><p className="mb-5 text-sm text-muted">Let everyone see the announcement, then begin discussion.</p><Button className="w-full" disabled={busy} onClick={() => void act("advance")}>Begin discussion <ArrowRight size={17} /></Button></>}
          {room.phase === "discussion" && <><p className="mb-5 text-sm text-muted">Move on when the group is ready. The timer can also open voting in device mode.</p><Button className="w-full" disabled={busy} onClick={() => void act("advance")}>Open voting <ArrowRight size={17} /></Button></>}
          {room.phase === "voting" && <>{room.settings.actionMode === "device" ? <><p className="mb-4 text-sm text-muted">{room.hostState?.votesSubmitted.length ?? 0}/{livingPlayers.length} votes submitted. Choices stay hidden until voting ends.</p><label className="flex items-center gap-3 text-sm font-bold"><input type="checkbox" checked={manualOverride} onChange={event => setManualOverride(event.target.checked)} className="h-5 w-5 accent-[#ff7da8]" /> Override the vote result</label></> : <p className="text-sm text-muted">Count the spoken votes, then select the player or players eliminated. Leave everyone unselected for a tie or no elimination.</p>}{(room.settings.actionMode === "guided" || manualOverride) && <EliminationChoices players={livingPlayers} roles={room.roles} selected={selectedPlayers} onToggle={togglePlayer} />}<Button className="mt-5 w-full" disabled={busy} onClick={() => void act("resolve", { kind: "vote", ...(room.settings.actionMode === "guided" || manualOverride ? { playerIds: selectedPlayers } : {}) })}>{room.settings.tieRule === "revote" && (room.settings.actionMode === "guided" || manualOverride) && selectedPlayers.length === 0 ? "Call a revote" : "Announce vote result"} <ArrowRight size={17} /></Button></>}
          {room.phase === "result" && <><p className="mb-5 text-sm text-muted">Round {room.round} is complete. Start round {room.round + 1} with a new night.</p><Button className="w-full" disabled={busy} onClick={() => void act("advance")}>Start round {room.round + 1} · Night <Moon size={17} /></Button></>}
          {room.roles.some(role => role.team === "Neutral") && <div className="mt-6 border-t-2 border-foreground/40 pt-5"><label className="field-label" htmlFor="customWinner">Custom role wins by group rule</label><div className="flex flex-wrap gap-2"><select id="customWinner" className="select flex-1" value={customWinner} onChange={event => setCustomWinner(event.target.value)}><option value="">Choose neutral role</option>{room.roles.filter(role => role.team === "Neutral").map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select><Button variant="gold" disabled={busy || !customWinner} onClick={() => { if (confirm("Declare this custom role the winner?")) void act("end", { winnerRoleId: customWinner }); }}>Declare win</Button></div></div>}
          <div className="mt-6 flex flex-wrap gap-2 border-t-2 border-foreground/40 pt-4"><Button size="sm" variant="ghost" disabled={busy} onClick={() => { if (confirm("End this game for everyone?")) void act("end"); }}>End game</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void deleteRoom()}><Trash2 size={15} /> Delete room</Button></div>
        </section>}
        {!room.viewer.host && room.phase !== "game_over" && <section className="panel p-5 sm:p-8"><p className="eyebrow mb-2">Your part</p><h3 className="display text-2xl uppercase">{room.viewer.spectator || !room.viewer.alive ? "WATCH THE STORY." : room.phase === "night" ? "EYES CLOSED." : room.phase === "voting" ? "YOUR VOTE." : "STAY IN THE GAME."}</h3>{room.viewer.spectator || !room.viewer.alive ? <p className="mt-4 text-sm leading-7 text-muted">You are a spectator. You can follow the results but cannot act or vote.</p> : room.phase === "night" && room.settings.actionMode === "device" && ownAbility !== "none" ? <><p className="mt-3 text-sm text-muted">{abilityText[ownAbility]} privately. The host and other players cannot see your choice before the result.</p><select aria-label="Night target" className="select mt-4" value={room.viewer.nightActionTargetId ?? selectedTarget} onChange={event => setSelectedTarget(event.target.value)} disabled={busy || !!room.viewer.nightActionTargetId}><option value="">Choose player</option>{actionTargets.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}</select><Button className="mt-4 w-full" disabled={busy || !selectedTarget || !!room.viewer.nightActionTargetId} onClick={() => void act("night_action", { targetId: selectedTarget })}>{room.viewer.nightActionTargetId ? "Action submitted" : "Submit night action"} <Check size={16} /></Button></> : room.phase === "voting" && room.settings.actionMode === "device" ? <><p className="mt-3 text-sm text-muted">Choose another living player. You have one private vote.</p><select aria-label="Vote target" className="select mt-4" value={selectedTarget} onChange={event => setSelectedTarget(event.target.value)} disabled={busy || room.viewer.voteSubmitted}><option value="">Choose player</option>{actionTargets.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}</select><Button className="mt-4 w-full" disabled={busy || !selectedTarget || room.viewer.voteSubmitted} onClick={() => void act("vote", { targetId: selectedTarget })}>{room.viewer.voteSubmitted ? "Vote submitted" : "Submit vote"} <Vote size={16} /></Button></> : <p className="mt-4 text-sm leading-7 text-muted">{room.settings.actionMode === "guided" ? "Follow the host's spoken instructions. Your phone will show the next announcement automatically." : "Wait for the next phase. Your screen updates automatically."}</p>}{room.viewer.inspectionResult && <div className="mt-5 border-2 border-gold bg-gold/10 p-4"><p className="eyebrow mb-1">Private inspection</p><p className="font-bold">{room.viewer.inspectionResult.targetName} is {room.viewer.inspectionResult.wasMafia ? "MAFIA" : "NOT MAFIA"}.</p></div>}</section>}
        {room.phase === "game_over" && room.viewer.host && <section className="panel p-5 sm:p-8"><p className="eyebrow mb-2">One more?</p><h3 className="display text-2xl">PLAY AGAIN TOGETHER.</h3><p className="mt-3 text-sm text-muted">Keep the room and names. Everyone returns to the waiting room with roles, deaths, actions, votes, and timers cleared.</p><Button className="mt-5 w-full" disabled={busy} onClick={() => void act("play_again")}>Play again <RotateCcw size={17} /></Button><Button variant="ghost" size="sm" className="mt-4" disabled={busy} onClick={() => void deleteRoom()}><Trash2 size={15} /> Delete room</Button></section>}
      </div><section className="panel h-fit overflow-hidden"><div className="panel-head"><div><p className="eyebrow mb-1">The room</p><h2 className="display text-2xl uppercase">WHO REMAINS?</h2></div><Users className="text-gold" /></div><div className="p-4 sm:p-6">{room.players.map(player => <div key={player.id} className="flex items-center gap-3 border-b border-foreground/30 py-3 last:border-0"><span className={`avatar ${!player.alive ? "!bg-[#4b4d53] !text-muted" : ""}`}>{player.name.charAt(0)}</span><span className="min-w-0 flex-1"><span className={`block truncate font-semibold ${!player.alive && !player.spectator ? "text-muted line-through" : ""}`}>{player.name}</span>{room.viewer.host && <span className="block truncate text-xs text-muted">{player.spectator ? "Spectator" : `${room.roles.find(role => role.id === player.roleId)?.name ?? "Unassigned"} · ${room.roles.find(role => role.id === player.roleId)?.team ?? "No team"}`}</span>}{!room.viewer.host && player.roleName && <span className="block truncate text-xs text-muted">{player.roleName}</span>}</span><span className={`text-xs font-black uppercase tracking-wider ${player.alive ? "text-gold" : "text-muted"}`}>{player.spectator ? "Watching" : player.alive ? "Alive" : "Out"}</span></div>)}</div><div className="border-t-2 border-foreground/40 p-5 text-xs leading-5 text-muted">Player screens update automatically. Role reveals follow the room setting.</div></section></div>}
    </main>}
    <footer className="relative mx-auto max-w-6xl flex flex-wrap items-center justify-between gap-2 border-t-2 border-foreground/40 px-4 py-6 text-xs text-muted sm:px-7"><span>© Nookplay · Every friend has a secret</span><span>Host guided · Private cards · Live updates</span></footer>
  </div></div>;
}

function EliminationChoices({ players, roles, selected, onToggle }: { players: Player[]; roles: Role[]; selected: string[]; onToggle: (id: string) => void }) {
  return <fieldset className="mt-4"><legend className="field-label">Eliminated players</legend><div className="space-y-2">{players.map(player => <label key={player.id} className={`flex cursor-pointer items-center gap-3 border-2 p-3 ${selected.includes(player.id) ? "border-primary bg-primary/10" : "border-foreground/50 bg-[#171a20]"}`}><input type="checkbox" className="h-5 w-5 shrink-0 accent-[#ff7da8]" checked={selected.includes(player.id)} onChange={() => onToggle(player.id)} /><span className="min-w-0 flex-1 font-bold">{player.name}</span><span className="text-xs text-muted">{roles.find(role => role.id === player.roleId)?.name ?? "Unknown"}</span></label>)}</div><p className="mt-2 text-xs text-muted">{selected.length ? `${selected.length} selected. Everyone selected is marked out together.` : "None selected means no elimination or a tie."}</p></fieldset>;
}
