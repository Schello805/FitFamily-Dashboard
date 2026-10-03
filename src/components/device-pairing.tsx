"use client";

import { useState } from "react";
import { Smartphone, ShieldCheck } from "lucide-react";
import { requestJson } from "@/lib/api-client";
import { TouchPinpad } from "@/components/touch-pinpad";

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
    <span>Eltern-PIN · 4 Ziffern</span><TouchPinpad value={pin} onChange={setPin} disabled={busy} />
    {error && <p className="form-error">{error}</p>}
    <button className="primary-submit" disabled={busy || !profileId || pin.length !== 4} onClick={pair}>{busy ? "Wird gekoppelt …" : "Handy koppeln"}</button>
    <small><ShieldCheck size={15} /> Nur im lokalen Familiennetzwerk</small>
  </section></main>;
}
