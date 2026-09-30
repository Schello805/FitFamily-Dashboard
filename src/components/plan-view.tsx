"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, Cpu, Sparkles } from "lucide-react";
import type { DashboardProfile } from "@/lib/domain";

type Plan = { id: string; title: string; goal: string; target_date: string | null; status: string; plan_json: { summary?: string; provider?: string; weeks?: { week: number; sessions: { title: string; type: string; minutes: number; exercises: string[] }[] }[] } };

export function PlanView({ profile, goals }: { profile: DashboardProfile; goals: string[] }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const load = () => fetch(`/api/plans?profileId=${profile.id}`).then((response) => response.json()).then((data) => setPlans(data.plans));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const active = plans.find((plan) => plan.status === "active");

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(""); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      profileId: profile.id, goal: form.get("goal"), level: form.get("level"), sessionsPerWeek: Number(form.get("sessions")), minutesPerSession: Number(form.get("minutes")), targetDate: form.get("targetDate") || null, provider: form.get("provider")
    }) });
    const result = await response.json(); setBusy(false);
    if (!response.ok) return setNotice(result.error ?? "Plan konnte nicht erstellt werden");
    setNotice(result.provider === "local" ? "Plan erstellt. Es war kein KI-Schlüssel eingerichtet; verwendet wurde die lokale Vorlage." : `Plan mit ${result.provider === "openai" ? "OpenAI" : "Gemini"} erstellt.`);
    setCreating(false); load();
  }

  return <main className="subpage" style={{ "--profile": profile.color } as React.CSSProperties}>
    <header><Link href={`/profil/${profile.id}`}><ArrowLeft /> Zurück</Link><div><span>Persönlicher Plan</span><h1>{profile.name}</h1></div><button onClick={() => setCreating(true)}><Sparkles /> Neuer Plan</button></header>
    {notice && <p className="notice">{notice}</p>}
    {active ? <section className="plan-document"><div className="plan-head"><div><span className="setup-badge">Aktiver Plan</span><h2>{active.title}</h2><p>{active.plan_json.summary}</p></div><div className="plan-meta"><CalendarDays />{active.target_date ? new Date(active.target_date).toLocaleDateString("de-DE") : "Offenes Ende"}<small>{active.plan_json.provider === "local" ? "Lokaler Vorschlag" : `Erstellt mit ${active.plan_json.provider}`}</small></div></div>
      <div className="week-grid">{active.plan_json.weeks?.map((week) => <article key={week.week}><h3>Woche {week.week}</h3>{week.sessions.map((session, index) => <div key={index}><CheckCircle2 /><span><b>{session.title}</b><small>{session.minutes} Min. · {session.exercises.join(" · ")}</small></span></div>)}</article>)}</div>
    </section> : <section className="empty-state large"><Cpu /><h2>Noch kein Trainingsplan</h2><p>Erstelle einen einfachen, auf eure Geräte abgestimmten Vorschlag.</p><button onClick={() => setCreating(true)}>Plan erstellen</button></section>}
    {creating && <div className="modal-backdrop"><form className="plan-modal" onSubmit={create}><button type="button" className="modal-close" onClick={() => setCreating(false)}>×</button><span className="setup-badge">Neuer Trainingsplan</span><h2>Ziel festlegen</h2><label>Trainingsziel<select name="goal">{goals.map((goal) => <option key={goal}>{goal}</option>)}</select></label><label>Trainingsstand<select name="level"><option>Einsteiger</option><option>Fortgeschritten</option><option>Erfahren</option></select></label><div className="two-fields"><label>Einheiten pro Woche<select name="sessions">{[1,2,3,4,5,6,7].map((value) => <option key={value}>{value}</option>)}</select></label><label>Dauer<select name="minutes">{[15,30,45,60,90].map((value) => <option key={value} value={value}>{value} Min.</option>)}</select></label></div><label>Zieldatum (optional)<input name="targetDate" type="date" /></label><label>Planerstellung<select name="provider"><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option><option value="local">Ohne KI · lokal</option></select></label><p className="ai-privacy">Es werden nur Ziel, Niveau, Zeit und Geräte anonymisiert übertragen.</p><button className="primary-submit" disabled={busy}>{busy ? "Plan wird erstellt …" : "Plan erstellen"}</button></form></div>}
  </main>;
}
