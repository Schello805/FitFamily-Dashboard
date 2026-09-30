"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { AVATAR_IDS, FITNESS_STAGES, type AvatarId, type ProfileAvatar } from "@/lib/domain";
import { AvatarPicker } from "@/components/avatar-picker";

type SetupProfile = { id: AvatarId; name: string; birthDate: string; avatar: ProfileAvatar; startingFitness: number };

const initialProfiles: SetupProfile[] = [
  { id: "mama", name: "Mama", birthDate: "1980-01-01", avatar: "mama", startingFitness: 3 },
  { id: "papa", name: "Papa", birthDate: "1980-01-01", avatar: "papa", startingFitness: 3 },
  { id: "fabian", name: "Fabian", birthDate: "2012-01-01", avatar: "fabian", startingFitness: 2 },
  { id: "frieda", name: "Frieda", birthDate: "2012-01-01", avatar: "frieda", startingFitness: 2 }
];
const setupDraftKey = "fitfamily-setup-profiles";

export function SetupForm() {
  const [profiles, setProfiles] = useState(initialProfiles.map((profile) => ({ ...profile })));
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);

  useEffect(() => {
    let savedProfiles: SetupProfile[] | null = null;
    try {
      const saved = window.sessionStorage.getItem(setupDraftKey);
      if (saved) {
        const draft: unknown = JSON.parse(saved);
        if (Array.isArray(draft) && draft.length === initialProfiles.length && draft.every((profile) =>
          profile && typeof profile === "object" &&
          ["mama", "papa", "fabian", "frieda"].includes(profile.id) &&
          typeof profile.name === "string" && typeof profile.birthDate === "string" &&
          [...AVATAR_IDS, "female", "male", "neutral"].includes(profile.avatar)
        )) savedProfiles = (draft as SetupProfile[]).map((profile) => ({
          ...profile,
          birthDate: profile.birthDate || initialProfiles.find((item) => item.id === profile.id)?.birthDate || "",
          avatar: AVATAR_IDS.includes(profile.avatar as AvatarId) ? profile.avatar : profile.id,
          startingFitness: Number.isInteger(profile.startingFitness) && profile.startingFitness >= 1 && profile.startingFitness <= 5 ? profile.startingFitness : initialProfiles.find((item) => item.id === profile.id)?.startingFitness ?? 3
        }));
      }
    } catch {
      // Browser storage can be unavailable; the form remains usable without it.
    }
    window.setTimeout(() => {
      if (savedProfiles) setProfiles(savedProfiles);
      setDraftLoaded(true);
    }, 0);
  }, []);

  useEffect(() => {
    if (!draftLoaded) return;
    try {
      window.sessionStorage.setItem(setupDraftKey, JSON.stringify(profiles));
    } catch {
      // Do not block setup if browser storage is unavailable.
    }
  }, [profiles, draftLoaded]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (pin !== confirmPin) return setError("Die beiden PIN-Eingaben stimmen nicht überein.");
    setBusy(true);
    try {
      const response = await fetch("/api/setup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, profiles: profiles.map((profile) => ({ ...profile, birthDate: profile.birthDate || null })) })
      });
      const result = await response.json();
      if (!response.ok) return setError(result.error ?? "Einrichtung konnte nicht gespeichert werden.");
      try { window.sessionStorage.removeItem(setupDraftKey); } catch { /* Best effort cleanup. */ }
      setDone(true);
    } catch {
      setError("Die Verbindung zum Dashboard wurde unterbrochen. Deine Profildaten sind in diesem Browser-Tab gesichert – bitte erneut versuchen.");
    } finally {
      setBusy(false);
    }
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
              <label>Geburtsdatum (Tag und Monat bitte prüfen)<input required type="date" value={profile.birthDate} onChange={(event) => setProfiles((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, birthDate: event.target.value } : item))} /></label>
              <label>Start-Fitness
                <select value={profile.startingFitness} onChange={(event) => setProfiles((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, startingFitness: Number(event.target.value) } : item))}>
                  {FITNESS_STAGES.map((st) => (
                    <option key={st.stage} value={st.stage}>{st.label} ({st.description})</option>
                  ))}
                </select>
              </label>
              <p className="field-hint">Startstufe 1–5 für den Avatar. Steigt mit je 15 Stunden Training an; das Verhältnis aus Kraft und Ausdauer formt die Figur.</p>
              <div className="avatar-choice"><span>Figur im Dashboard</span><AvatarPicker value={AVATAR_IDS.includes(profile.avatar as AvatarId) ? profile.avatar as AvatarId : profile.id} onChange={(avatar) => setProfiles((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, avatar } : item))} name={`avatar-${profile.id}`} /></div>
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
        <p className="local-hint"><ShieldCheck size={16} /> Profildaten werden lokal gespeichert. Ein Entwurf bleibt bei einem Neuladen in diesem Browser-Tab erhalten; der Eltern-PIN wird nicht zwischengespeichert.</p>
      </form>
    </main>
  );
}
