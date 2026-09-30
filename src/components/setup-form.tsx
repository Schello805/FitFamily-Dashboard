"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, LockKeyhole, ShieldCheck } from "lucide-react";

type SetupProfile = { id: "mama" | "papa" | "fabian" | "frieda"; name: string; birthDate: string; avatar: "female" | "male" | "neutral" };

const initialProfiles: SetupProfile[] = [
  { id: "mama", name: "Mama", birthDate: "", avatar: "female" },
  { id: "papa", name: "Papa", birthDate: "", avatar: "male" },
  { id: "fabian", name: "Fabian", birthDate: "", avatar: "male" },
  { id: "frieda", name: "Frieda", birthDate: "", avatar: "female" }
];

export function SetupForm() {
  const [profiles, setProfiles] = useState(initialProfiles.map((profile) => ({ ...profile })));
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (pin !== confirmPin) return setError("Die beiden PIN-Eingaben stimmen nicht überein.");
    setBusy(true);
    const response = await fetch("/api/setup", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, profiles: profiles.map((profile) => ({ ...profile, birthDate: profile.birthDate || null })) })
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error ?? "Einrichtung konnte nicht gespeichert werden.");
    setDone(true);
  }

  if (done) return <main className="mobile-page"><section className="success-card"><div><Check size={42} /></div><h1>Alles bereit!</h1><p>Das FitFamily Dashboard startet jetzt auf dem Wandmonitor. Diese Seite kann geschlossen werden.</p><Link href="/">Dashboard öffnen</Link></section></main>;

  return (
    <main className="mobile-page">
      <header className="mobile-header"><span>FitFamily</span><b>Ersteinrichtung</b></header>
      <form className="setup-form" onSubmit={submit}>
        <section className="mobile-intro"><span className="setup-badge">Schritt 1 von 1</span><h1>Eure Familie.<br />Euer Dashboard.</h1><p>Lege die wichtigsten Profildaten fest. Alles kann später im geschützten Bereich geändert werden.</p></section>
        <section className="form-card">
          <div className="form-title"><ShieldCheck /><div><h2>Familienprofile</h2><p>Geburtsdaten ermöglichen altersgerechte Bewegungsziele.</p></div></div>
          {profiles.map((profile, index) => (
            <fieldset key={profile.id}>
              <legend>{profile.name}</legend>
              <label>Anzeigename<input required maxLength={30} value={profile.name} onChange={(event) => setProfiles((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label>
              <label>Geburtsdatum<input required type="date" value={profile.birthDate} onChange={(event) => setProfiles((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, birthDate: event.target.value } : item))} /></label>
              <label>Avatar<select value={profile.avatar} onChange={(event) => setProfiles((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, avatar: event.target.value as "female" | "male" | "neutral" } : item))}><option value="female">Weiblich</option><option value="male">Männlich</option><option value="neutral">Neutral</option></select></label>
            </fieldset>
          ))}
        </section>
        <section className="form-card">
          <div className="form-title"><LockKeyhole /><div><h2>Eltern-PIN</h2><p>Schützt Einstellungen, Löschungen, Backups und API-Schlüssel.</p></div></div>
          <label>PIN (4–8 Ziffern)<input required pattern="[0-9]{4,8}" inputMode="numeric" type="password" value={pin} onChange={(event) => setPin(event.target.value)} /></label>
          <label>PIN wiederholen<input required pattern="[0-9]{4,8}" inputMode="numeric" type="password" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value)} /></label>
        </section>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-submit" disabled={busy}>{busy ? "Wird gespeichert …" : "Dashboard einrichten"}<ChevronRight /></button>
        <p className="local-hint"><ShieldCheck size={16} /> Profildaten werden ausschließlich lokal gespeichert.</p>
      </form>
    </main>
  );
}
