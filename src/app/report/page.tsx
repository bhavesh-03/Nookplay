"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Bug, Check, ExternalLink, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const issuesUrl = "https://github.com/bhavesh-03/Nookplay/issues/new?template=bug_report.yml";
const formId = process.env.NEXT_PUBLIC_FORMSPREE_FORM_ID;

export default function ReportPage() {
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      if (!formId || !/^[a-zA-Z0-9]+$/.test(formId)) throw new Error("Bug reporting is being set up. Please use GitHub Issues for now.");
      const response = await fetch(`https://formspree.io/f/${formId}`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ _subject: `[Nookplay bug] ${title}`, title, message: description, "Steps to repeat": steps, email, _gotcha: website })
      });
      if (response.status === 429) throw new Error("Too many reports were sent just now. Please wait and try again.");
      if (!response.ok) throw new Error("The report could not be sent. Please try again or use GitHub Issues.");
      setSent(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not send the report."); }
    finally { setBusy(false); }
  }

  return <div className="glow relative min-h-screen overflow-hidden"><div className="grain pointer-events-none absolute inset-0" /><div className="relative z-10">
    <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 border-b-2 border-foreground/40 px-4 py-5 sm:px-7"><Link href="/" className="flex items-center gap-2.5" aria-label="Nookplay home"><span className="flex h-10 w-10 items-center justify-center border-2 border-foreground bg-primary text-[#16181d] shadow-[3px_3px_0_#ffe16a]"><Moon size={22} fill="currentColor" /></span><span className="display text-[26px] sm:text-[30px]">nookplay<span className="text-primary">.</span></span></Link><Link href="/" className="chip text-xs font-black"><ArrowLeft size={15} /> Back to game</Link></header>
    <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-7 lg:grid-cols-[.8fr_1.2fr] lg:gap-14 lg:py-20"><div><span className="mb-6 inline-flex h-16 w-16 items-center justify-center border-2 border-foreground bg-gold text-[#17191f] shadow-[5px_5px_0_#ff7da8]"><Bug size={32} /></span><p className="eyebrow mb-3">Help us make the game better</p><h1 className="display text-5xl uppercase sm:text-6xl">REPORT A <span className="text-primary">BUG.</span></h1><p className="mt-6 max-w-sm text-sm leading-7 text-muted">Tell us what went wrong. A clear description and steps to repeat it help us fix it faster. Please don&apos;t include secret roles, room tokens, or passwords.</p><a className="mt-7 inline-flex items-center gap-2 border-b-2 border-gold pb-1 text-sm font-bold text-gold" href={issuesUrl} target="_blank" rel="noreferrer">Prefer GitHub Issues? <ExternalLink size={15} /></a></div>
      <section className="panel h-fit p-5 sm:p-8">{sent ? <div role="status" className="py-10 text-center"><Check className="mx-auto mb-5 text-gold" size={48} /><h2 className="display text-3xl">REPORT SENT.</h2><p className="mt-4 text-sm text-muted">Thanks for helping improve Nookplay.</p><Button className="mt-7" onClick={() => { setSent(false); setTitle(""); setDescription(""); setSteps(""); }}>Send another report <ArrowRight size={16} /></Button></div> : <><p className="eyebrow mb-2">A note to the makers</p><h2 className="display mb-7 text-2xl uppercase sm:text-3xl">WHAT HAPPENED?</h2><form onSubmit={submit} className="space-y-5"><div><label className="field-label" htmlFor="report-title">Short title</label><Input id="report-title" required minLength={5} maxLength={100} value={title} onChange={event => setTitle(event.target.value)} placeholder="Players cannot join my room" /></div><div><label className="field-label" htmlFor="report-description">Description</label><textarea id="report-description" required minLength={20} maxLength={4000} rows={6} value={description} onChange={event => setDescription(event.target.value)} placeholder="What did you expect to happen? What actually happened?" className="report-textarea" /></div><div><label className="field-label" htmlFor="report-steps">Steps to repeat it <span className="font-normal normal-case text-muted">(optional)</span></label><textarea id="report-steps" maxLength={1500} rows={4} value={steps} onChange={event => setSteps(event.target.value)} placeholder="1. Create a room…" className="report-textarea" /></div><div><label className="field-label" htmlFor="report-email">Your email <span className="font-normal normal-case text-muted">(optional, for a reply)</span></label><Input id="report-email" type="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" /></div><div className="hidden" aria-hidden="true"><label htmlFor="report-website">Website</label><input id="report-website" tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></div>{error && <div role="alert" className="error">{error} <a href={issuesUrl} target="_blank" rel="noreferrer" className="underline">Open a GitHub issue</a>.</div>}<Button type="submit" disabled={busy} size="lg" className="w-full">{busy ? "Sending…" : "Send bug report"}<ArrowRight size={18} /></Button></form></>}</section></main>
    <footer className="relative mx-auto max-w-5xl border-t-2 border-foreground/40 px-4 py-6 text-xs text-muted sm:px-7">© Nookplay · Host the night. Read the room.</footer>
  </div></div>;
}
