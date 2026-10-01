"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, CheckCircle2, Cpu, Download, PlayCircle, Sparkles, Upload } from "lucide-react";
import type { DashboardProfile } from "@/lib/domain";
import { showToast } from "@/components/toast";
import { normalizePlanJson, type NormalizedPlan } from "@/lib/plan-normalizer";
import { resolveExerciseId } from "@/lib/exercise-guides";

type Plan = {
  id: string;
  title: string;
  goal: string;
  target_date: string | null;
  status: string;
  plan_json: NormalizedPlan | Record<string, unknown>;
};

export function PlanView({ profile, goals }: { profile: DashboardProfile; goals: string[] }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const load = () => fetch(`/api/plans?profileId=${profile.id}`).then((response) => response.json()).then((data) => setPlans(data.plans || []));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const active = plans.find((plan) => plan.status === "active");
  const activePlanJson = active ? normalizePlanJson(active.plan_json) : null;

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(""); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      profileId: profile.id, goal: form.get("goal"), level: form.get("level"), sessionsPerWeek: Number(form.get("sessions")), minutesPerSession: Number(form.get("minutes")), targetDate: form.get("targetDate") || null, provider: form.get("provider")
    }) });
    const result = await response.json(); setBusy(false);
    if (!response.ok) return setNotice(result.error ?? "Plan konnte nicht erstellt werden");
    const selectedProvider = form.get("provider");
    const msg = result.provider === "local"
      ? (selectedProvider !== "local" ? "Plan als lokale Vorlage erstellt (Kein aktiver KI-Schlüssel hinterlegt)." : "Plan erstellt (lokale Vorlage).")
      : `Plan mit ${result.provider === "openai" ? "OpenAI" : "Gemini"} erstellt.`;
    setNotice(msg);
    showToast({
      type: "sparkles",
      title: "Neuer Trainingsplan bereit",
      message: msg
    });
    setCreating(false); load();
  }

  async function importJson(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    event.currentTarget.value = "";
    if (file.size > 512 * 1024) return setNotice("Die Plan-Datei darf höchstens 512 KB groß sein.");
    setBusy(true); setNotice("");
    try {
      const plan = JSON.parse(await file.text());
      const response = await fetch("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import", profileId: profile.id, plan }) });
      const result = await response.json();
      if (!response.ok) return setNotice(result.error ?? "Der Trainingsplan konnte nicht importiert werden.");
      setNotice("Trainingsplan importiert. Der vorherige aktive Plan wurde archiviert.");
      showToast({
        type: "success",
        title: "Trainingsplan importiert",
        message: "Der importierte Plan ist ab jetzt aktiv."
      });
      await load();
    } catch {
      setNotice("Die Datei enthält kein gültiges JSON. Nutze am besten die FitFamily-Vorlage.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="subpage" style={{ "--profile": profile.color } as React.CSSProperties}>
    <header><Link href={`/profil/${profile.id}`}><ArrowLeft /> Zurück</Link><div><span>Persönlicher Plan</span><h1>{profile.name}</h1></div><div className="plan-actions"><a className="plan-template" href="/assets/trainingsplan-vorlage.json" download><Download /> Vorlage</a><label className="plan-import"> <Upload /> JSON laden<input type="file" accept="application/json,.json" onChange={importJson} disabled={busy} /></label><button onClick={() => setCreating(true)}><Sparkles /> Neuer Plan</button></div></header>
    {notice && <p className="notice">{notice}</p>}
    {active ? (
      <section className="plan-document">
        <div className="plan-head">
          <div>
            <span className="setup-badge">Aktiver Plan</span>
            <h2>{active.title}</h2>
            <p>{activePlanJson?.summary || "Persönlicher Trainingsplan"}</p>
          </div>
          <div className="plan-meta">
            <CalendarDays />
            {active.target_date ? new Date(active.target_date).toLocaleDateString("de-DE") : "Offenes Ende"}
            <small>
              {activePlanJson?.provider === "local"
                ? "Lokaler Vorschlag"
                : activePlanJson?.provider
                  ? `Erstellt mit ${activePlanJson.provider}`
                  : "Aktiv"}
            </small>
          </div>
        </div>

        {activePlanJson && activePlanJson.weeks.length > 0 ? (
          <div className="week-grid">
            {activePlanJson.weeks.map((week) => (
              <article key={week.week}>
                <h3>Woche {week.week}</h3>
                {week.sessions.map((session, index) => {
                  const primaryExId = resolveExerciseId(session.exercises?.[0] || session.title);
                  return (
                    <div key={index} className="plan-session-card">
                      <div className="plan-session-header">
                        <Link
                          href={`/uebung/${primaryExId}?profil=${profile.id}&fromPlan=1`}
                          className="plan-session-title-link"
                          title="Anleitung & Video öffnen"
                        >
                          <CheckCircle2 className="plan-session-check" />
                          <span className="plan-session-name">{session.title}</span>
                          <span className="plan-session-video-badge">
                            <PlayCircle size={13} />
                            Anleitung
                          </span>
                        </Link>
                      </div>

                      <div className="plan-session-meta">
                        {session.date ? `${new Date(`${session.date}T12:00:00`).toLocaleDateString("de-DE")} · ` : ""}
                        {session.minutes} Min.
                        {session.distanceKm ? ` · ${session.distanceKm} km` : ""}
                      </div>

                      {Array.isArray(session.exercises) && session.exercises.length > 0 && (
                        <div className="plan-exercise-chips">
                          {session.exercises.map((ex, exIndex) => {
                            const exId = resolveExerciseId(ex);
                            return (
                              <Link
                                key={exIndex}
                                href={`/uebung/${exId}?profil=${profile.id}&fromPlan=1`}
                                className="plan-exercise-chip"
                                title={`Anleitung & Video für ${ex} ansehen`}
                              >
                                <PlayCircle size={13} />
                                <span>{ex}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ marginTop: "1.5rem" }}>
            <p>Für diesen Plan konnten keine Einheiten angezeigt werden.</p>
            <button onClick={() => setCreating(true)} style={{ marginTop: "0.5rem" }}>
              <Sparkles /> Neuen Plan generieren
            </button>
          </div>
        )}
      </section>
    ) : <section className="empty-state large"><Cpu /><h2>Noch kein Trainingsplan</h2><p>Erstelle einen einfachen, auf eure Geräte abgestimmten Vorschlag.</p><button onClick={() => setCreating(true)}>Plan erstellen</button></section>}
    {creating && (() => {
      const defaultLevel = profile.fitnessStage <= 2 ? "Einsteiger" : profile.fitnessStage <= 4 ? "Fortgeschritten" : "Erfahren";
      return (
        <div className="modal-backdrop"><form className="plan-modal" onSubmit={create}><button type="button" className="modal-close" onClick={() => setCreating(false)}>×</button><span className="setup-badge">Neuer Trainingsplan</span><h2>Ziel für {profile.name} festlegen</h2><label>Trainingsziel<select name="goal" defaultValue={profile.goal}>{goals.map((goal) => <option key={goal}>{goal}</option>)}</select></label><label>Trainingsstand<select name="level" defaultValue={defaultLevel}><option>Einsteiger</option><option>Fortgeschritten</option><option>Erfahren</option></select></label><div className="two-fields"><label>Einheiten pro Woche<select name="sessions" defaultValue={3}>{[1,2,3,4,5,6,7].map((value) => <option key={value}>{value}</option>)}</select></label><label>Dauer<select name="minutes" defaultValue={30}>{[15,30,45,60,90].map((value) => <option key={value} value={value}>{value} Min.</option>)}</select></label></div><label>Zieldatum (optional)<input name="targetDate" type="date" /></label><label>Planerstellung<select name="provider"><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option><option value="local">Ohne KI · lokal</option></select></label><p className="ai-privacy">Es werden nur Ziel, Niveau, Zeit und Geräte anonymisiert übertragen.</p><button className="primary-submit" disabled={busy}>{busy ? "Plan wird erstellt …" : "Plan erstellen"}</button></form></div>
      );
    })()}
  </main>;
}
