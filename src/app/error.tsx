"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("FitFamily-Anwendungsfehler", error);
    void fetch("/api/admin/logs/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: error.message, digest: error.digest, path: window.location.pathname })
    }).catch(() => undefined);
  }, [error]);

  return (
    <main className="app-error-page">
      <div className="app-error-card">
        <span className="app-error-icon"><AlertTriangle size={28} /></span>
        <p className="setup-badge">FitFamily Dashboard</p>
        <h1>Das hat gerade nicht geklappt.</h1>
        <p>Die technische Meldung wurde – sofern das Dashboard erreichbar war – aufgezeichnet. Bitte versuche es erneut.</p>
        {error.digest && <small>Fehlerkennung: {error.digest}</small>}
        <div>
          <button type="button" onClick={reset}><RefreshCw size={16} /> Erneut versuchen</button>
          <Link href="/">Zum Dashboard</Link>
        </div>
      </div>
    </main>
  );
}
