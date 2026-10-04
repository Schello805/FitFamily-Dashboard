"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleHelp, X } from "lucide-react";
import { Modal } from "@/components/modal";

const helpSeenKey = "fitfamily-user-help-seen-v1";

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
        <span className="setup-badge">FitFamily · Kurz erklärt</span>
        <h2 id="user-help-title">Von deinem Profil bis zum Trainingsfortschritt</h2>
        <ol className="user-help-steps">
          <li><b>Wähle dein Profil.</b><span>Dein Dashboard zeigt deine Trainingspunkte, dein Bewegungsziel und deinen Verlauf. Tippe im Profil auf deine Figur, um Profil, Fitnessstufe und Avatar zu bearbeiten. Über „Handy verknüpfen“ kannst du das Training auf deinem Smartphone steuern.</span></li>
          <li><b>Starte eine Übung oder erstelle einen Plan.</b><span>Wähle im Profil entweder den Direktstart über „Kraft“ oder „Ausdauer“ oder deinen persönlichen KI-Trainingsplan. Beim KI-Plan gibst du Ziel, Trainingsstand, Häufigkeit und Dauer an; berücksichtigt werden die verfügbaren Geräte. Du kannst auch ohne KI planen.</span></li>
          <li><b>Trainiere und beende die Einheit.</b><span>Wähle eine Übung für Video oder Anleitung, starte das Training und beende es nachher mit „Beenden“ oder „Stopp“. FitFamily speichert die Einheit für deinen Verlauf und Score. Falsch gestartete Einträge kannst du im Verlauf nachträglich bearbeiten oder löschen.</span></li>
          <li><b>Watch oder Gymondo zeichnet nach Apple Health auf?</b><span>Beim Start fragt FitFamily danach. „Ja“: Der App-Timer läuft nur zur Orientierung, ohne Punkte, Ziel- oder Levelminuten. Erst importierte aktive Trainingszeiten zählen mit 1,5 Punkten pro Minute. „Nein“: FitFamily zählt seine eigene Zeit. Starte und stoppe Watch/Gymondo selbst. Der Import erfolgt derzeit über den Mac und die Verwaltung, nicht automatisch. Duplikate und Überschneidungen werden nicht zusätzlich gewertet. Importierte Zeiten sind im Verlauf schreibgeschützt; Geräteminuten können daraus nicht zuverlässig zugeordnet werden.</span></li>
          <li><b>Sieh dir deine Entwicklung an.</b><span>Auf dem Dashboard findest du Bewegungsziel, Trainingsminuten und Punkte. Im Profil kannst du deinen Trainingsverlauf ansehen.</span></li>
          <li><b>Zielkreis: dein Tag oder deine Woche.</b><span>Erfasste Kraft- und Ausdauerminuten füllen den Kreis bis 100 %. Erwachsene haben ein Wochenziel, Kinder ein Tagesziel; die Minuten stehen unter dem Kreis. Mit dem neuen Tag bzw. der neuen Woche beginnt das Ziel wieder bei 0. „Auf null setzen“ setzt auch das Ziel zurück.</span></li>
          <li><b>Trainingspunkte: Kraft 1, Ausdauer 2, Health 1,5.</b><span>Pro App-Trainingsminute erhältst du 1 Punkt für Kraft oder 2 Punkte für Ausdauer. Importierte aktive Health-Minuten ergeben 1,5 Punkte, unabhängig von der Art. Das Dashboard zeigt ganze Punkte, Restbruchteile bleiben in der Berechnung erhalten. Nach „Auf null setzen“ zählen nur neue Minuten – dann heißt die Anzeige „Punkte seit Reset“. Frühere Einheiten bleiben im Verlauf. Ohne neue Einheiten können die Punkte deshalb 0 sein.</span></li>
          <li><b>Trainingslevel: dein langfristiger Fortschritt.</b><span>Jede abgeschlossene Trainingsminute zählt gleich, egal ob Kraft oder Ausdauer. Level 2 erreichst du ab insgesamt 150 Minuten, Level 3 ab 450, Level 4 ab 900. Danach werden die Abstände größer, bis Level 50. Der Aufstieg erfolgt automatisch nach dem Beenden einer Einheit; der Balken zeigt den Weg zum nächsten Level. Ein Punkte-Reset setzt den Level nicht zurück, aber Bearbeiten oder Löschen alter Trainings kann ihn ändern. Die manuell gewählte Fitnessstufe deiner Figur ist davon unabhängig.</span></li>
          <li><b>Optional: Mach die Figur zu deiner.</b><span>Unter „Profil bearbeiten“ kannst du ein Frontalfoto mit OpenAI oder Gemini in einen Cartoon-Kopf verwandeln. Du siehst erst eine Vorschau und entscheidest dann, ob du sie speicherst. Das Foto wird zur Verarbeitung an den gewählten Anbieter übertragen; dafür können separate API-Gebühren anfallen. Das Original bleibt nicht in FitFamily gespeichert.</span></li>
        </ol>
        <p className="user-help-note">Die KI ist eine Trainingshilfe und kein Ersatz für medizinische Beratung. Trainiere nur so, wie es sich für dich sicher anfühlt.</p>
        <button type="button" className="primary-submit" onClick={close}>Alles klar</button>
      </section>
    </Modal>}
  </>;
}
