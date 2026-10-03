"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export function ScanStart({ kind, id }: { kind: "geraet" | "uebung"; id: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const started = useRef(false);
  const start = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id }) });
      if (response.status === 401) {
        window.location.replace(`/geraet-koppeln?weiter=${encodeURIComponent(`/scan/${kind}/${encodeURIComponent(id)}`)}`);
        return;
      }
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Training konnte nicht gestartet werden.");
      window.location.replace("/training/am-geraet");
    } catch (e) { setError(e instanceof Error ? e.message : "Server nicht erreichbar."); setBusy(false); }
  }, [kind, id]);
  useEffect(() => { if (!started.current) { started.current = true; void start(); } }, [start]);
  return <main className="mobile-page"><section className="pair-card"><span className="setup-badge">Geräte-Scan</span><h1>{busy ? "Training wird gestartet …" : "Start nicht möglich"}</h1>{error && <p role="alert" className="form-error">{error}</p>}{!busy && <button className="primary-submit" onClick={() => void start()}>Erneut versuchen</button>}<Link href="/">Zum Dashboard</Link></section></main>;
}
