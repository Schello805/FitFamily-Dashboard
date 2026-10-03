"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { RefreshCw, Sparkles } from "lucide-react";
import { requestJson } from "@/lib/api-client";

export function FirstRun({ setupUrl, qr }: { setupUrl: string; qr: string }) {
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await requestJson<{ setupComplete?: boolean }>("/api/setup", "Einrichtungsstatus nicht verfügbar.", { cache: "no-store" });
        if (data.setupComplete) {
          setComplete(true);
          clearInterval(interval);
          setTimeout(() => {
            window.location.reload();
          }, 500);
        }
      } catch {
        // ignore network error
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="first-run">
      <section className="first-run-copy">
        <div className="first-run-brand">
          <Image className="first-run-logo" src="/assets/fitfamily-logo.png" alt="" width={300} height={300} priority />
          <span>FAMILIEN-FITNESS<br /><b>LOKAL &amp; PRIVAT</b></span>
        </div>
        <div className="setup-badge">Willkommen</div>
        <h1>Euer Sportraum.<br /><span>Euer Dashboard.</span></h1>
        <p>Scanne den QR-Code mit einem Handy im selben WLAN. Dort legst du Eltern-PIN und Profildaten sicher fest – ganz ohne Tastatur am Monitor.</p>
        <div className="privacy-note">
          <b>Alles unter einem Dach.</b>
          <span>Deine Familien- und Trainingsdaten bleiben lokal auf diesem FitFamily-Gerät.</span>
        </div>

        {complete ? (
          <div style={{ marginTop: "20px", padding: "14px 18px", borderRadius: "14px", background: "rgba(45, 212, 191, 0.15)", border: "1px solid rgba(45, 212, 191, 0.3)", color: "#2dd4bf", display: "flex", alignItems: "center", gap: "10px" }}>
            <Sparkles size={20} />
            <b>Einrichtung erkannt! Dashboard startet sofort …</b>
          </div>
        ) : (
          <div style={{ marginTop: "24px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <a
              href="/einrichtung"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 18px",
                borderRadius: "12px",
                background: "rgba(45, 212, 191, 0.12)",
                border: "1px solid rgba(45, 212, 191, 0.3)",
                color: "#2dd4bf",
                fontSize: "13px",
                fontWeight: 750,
                textDecoration: "none"
              }}
            >
              Direkt an diesem Bildschirm einrichten →
            </a>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "10px 14px",
                borderRadius: "12px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid var(--line)",
                color: "var(--muted)",
                fontSize: "12px",
                cursor: "pointer"
              }}
            >
              <RefreshCw size={14} />
              Neu laden
            </button>
          </div>
        )}
      </section>

      <section className="qr-panel">
        <div className="qr-heading">
          <span>STARTKLAR IN EINEM MOMENT</span>
          <h2>Mit dem Handy<br />einrichten</h2>
          <p>Einfach den Code scannen</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR-Code zur Einrichtung am Handy" />
        <div className="qr-caption">
          <strong>Einmal scannen, dann loslegen.</strong>
          <span>Der Einrichtungsassistent öffnet sich direkt im Browser deines Handys. Der Monitor wechselt danach automatisch.</span>
        </div>
        <code><i /> {setupUrl}</code>
      </section>
    </main>
  );
}
