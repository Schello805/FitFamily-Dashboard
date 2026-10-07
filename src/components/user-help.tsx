"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleHelp, X } from "lucide-react";
import { Modal } from "@/components/modal";

const helpSeenKey = "fitfamily-user-help-seen-v2";

export function UserHelp() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
    try { localStorage.setItem(helpSeenKey, "true"); } catch {}
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (localStorage.getItem(helpSeenKey) !== "true") setOpen(true);
      } catch {
        setOpen(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return <>
    <button type="button" className="user-help-launch" onClick={() => setOpen(true)} aria-label="Hilfe zum Ablauf öffnen" title="So funktioniert FitFamily">
      <CircleHelp size={21} /><span>Hilfe</span>
    </button>
    {open && <Modal className="user-help-backdrop" onClose={close}>
      <section className="user-help-modal" role="dialog" aria-modal="true" aria-labelledby="user-help-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={close} aria-label="Hilfe schließen"><X /></button>
        <span className="setup-badge">FitFamily · Schnellstart</span>
        <h2 id="user-help-title">So trainierst du mit FitFamily</h2>
        <ol className="user-help-steps">
          <li><b>Profil wählen.</b><span>Tippe deine Karte an. Dort startest du Training, siehst Verlauf und kannst dein Profil bearbeiten.</span></li>
          <li><b>Training starten.</b><span>Wähle „Kraft“, „Ausdauer“ oder den KI-Trainingsplan. Beim Plan läuft zuerst die Vorbereitung; erst danach zählt die Übungszeit.</span></li>
          <li><b>Späterer Apple-Health-Import?</b><span>Dann antworte bei der Frage mit „Ja“: Der App-Timer zählt nicht doppelt. Ohne späteren Import antwortest du „Nein“ und die App-Zeit zählt. Health-Trainings importierst du im eigenen Profil.</span></li>
          <li><b>Entwicklung verstehen.</b><span>Der Kreis zeigt dein Tages- oder Wochenziel. Punkte: Kraft 1, Ausdauer 2, Health 1,5 pro aktiver Minute. Schritte und kcal bleiben ohne Wertung.</span></li>
          <li><b>Trainingslevel: dein langfristiger Fortschritt.</b><span>Alle abgeschlossenen Minuten zählen. Level 2 erreichst du ab insgesamt 150 Minuten, danach geht es automatisch weiter. Ein Punkte-Reset setzt den Level nicht zurück.</span></li>
          <li><b>Etwas falsch?</b><span>Im „Verlauf“ kannst du Einträge ändern oder löschen. Persönliche Avatare bearbeitest du direkt im Profil.</span></li>
        </ol>
        <p className="user-help-note">Die KI ist eine Trainingshilfe und kein Ersatz für medizinische Beratung. Trainiere nur so, wie es sich für dich sicher anfühlt.</p>
        <button type="button" className="primary-submit" onClick={close}>Alles klar</button>
      </section>
    </Modal>}
  </>;
}
