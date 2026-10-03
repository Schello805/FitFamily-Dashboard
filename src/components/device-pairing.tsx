"use client";

import { useState } from "react";
import { Smartphone, ShieldCheck } from "lucide-react";
import { requestJson } from "@/lib/api-client";

export function DevicePairing({ profiles, nextPath }: { profiles: { id: string; name: string; color: string }[]; nextPath: string }) {
  const [profileId, setProfileId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function pair() {
    setBusy(true); setError("");
    try {
      await requestJson("/api/device/pair", "Kopplung fehlgeschlagen", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, pin, label: navigator.userAgent.includes("iPhone") ? "iPhone" : "Mobilgerät" })
      });
      window.location.href = nextPath;
    } catch (error) {
      setError(error instanceof Error ? error.message : "Kopplung fehlgeschlagen");
      setBusy(false);
    }
  }

  return <main className="mobile-page"><section className="pair-card">
    <div className="pair-icon"><Smartphone /></div><span className="setup-badge">Neues Gerät</span><h1>Wem gehört<br />dieses Handy?</h1><p>Die Auswahl wird sicher im Browser gespeichert und kann später widerrufen werden.</p>
    <div className="profile-choice">{profiles.map((profile) => <button key={profile.id} onClick={() => setProfileId(profile.id)} className={profileId === profile.id ? "selected" : ""} style={{ "--profile": profile.color } as React.CSSProperties}><i />{profile.name}</button>)}</div>
    <label>Eltern-PIN (4 Ziffern)<input inputMode="numeric" type="password" minLength={4} maxLength={4} pattern="[0-9]{4}" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} /></label>
    {error && <p className="form-error">{error}</p>}
    <button className="primary-submit" disabled={busy || !profileId || pin.length !== 4} onClick={pair}>{busy ? "Wird gekoppelt …" : "Handy koppeln"}</button>
    <small><ShieldCheck size={15} /> Nur im lokalen Familiennetzwerk</small>
  </section></main>;
}
