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
          <li><b>Importierst du dieses Training später manuell?</b><span>„Ja“: Der App-Timer läuft ohne Punkte, Ziel- oder Levelminuten; erst der manuelle Apple-Health-Export zählt mit 1,5 Punkten pro aktiver Minute. „Nein“: FitFamily zählt seine aktive Zeit. Nur die Watch zu tragen bedeutet nicht „Ja“. Im eigenen Profil „Health-Training importieren“ öffnen, ZIP/XML auswählen, Zeitraum und Trainingsart prüfen und bestätigen. Die Datei bleibt lokal; Duplikate und Überschneidungen werden nicht zusätzlich gewertet. kcal und Schritte bleiben unabhängig davon unbewertet.</span></li>
          <li><b>Im KI-Plan: erst vorbereiten, dann trainieren.</b><span>Vor jeder Übung läuft ein Vorbereitungs-Countdown. Diese Zeit und der Wechsel zählen nicht. Nach Ablauf der Übungszeit stoppt die Wertung; die nächste Übung wartet auf deinen Klick. Die Vorbereitungszeit wird zentral in der Verwaltung auf 5, 10, 20, 30 oder 60 Sekunden gesetzt. Signaltöne warnen 30 Sekunden vor Ende und in den letzten fünf Sekunden, sofern dein Browser Ton erlaubt.</span></li>
          <li><b>Sieh dir deine Entwicklung an.</b><span>Auf dem Dashboard findest du Bewegungsziel, Trainingsminuten und Punkte. Im Profil kannst du deinen Trainingsverlauf ansehen.</span></li>
          <li><b>Zielkreis: dein Tag oder deine Woche.</b><span>Erfasste Kraft- und Ausdauerminuten füllen den Kreis bis 100 %. Erwachsene haben ein Wochenziel ab Montag, Kinder ein Tagesziel; die Minuten stehen unter dem Kreis. Mit dem neuen Tag bzw. der neuen Woche beginnt das Ziel wieder bei 0. Ein Punkte-Reset verändert den Kreis nicht; alle vorhandenen Trainings des Zeitraums zählen weiterhin.</span></li>
          <li><b>Trainingspunkte: Kraft 1, Ausdauer 2, Health 1,5.</b><span>Pro App-Trainingsminute erhältst du 1 Punkt für Kraft oder 2 Punkte für Ausdauer. Importierte aktive Health-Minuten ergeben 1,5 Punkte, unabhängig von der Art. Das Dashboard zeigt ganze Punkte, Restbruchteile bleiben in der Berechnung erhalten. Nach „Auf null setzen“ zählen nur neue Minuten – dann heißt die Anzeige „Punkte seit Reset“. Frühere Einheiten bleiben im Verlauf. Ohne neue Einheiten können die Punkte deshalb 0 sein.</span></li>
          <li><b>Trainingslevel: dein langfristiger Fortschritt.</b><span>Jede abgeschlossene Trainingsminute zählt gleich, egal ob Kraft oder Ausdauer. Level 2 erreichst du ab insgesamt 150 Minuten, Level 3 ab 450, Level 4 ab 900. Danach werden die Abstände größer, bis Level 50. Der Aufstieg erfolgt automatisch nach dem Beenden einer Einheit; der Balken zeigt den Weg zum nächsten Level. Ein Punkte-Reset setzt den Level nicht zurück, aber Bearbeiten oder Löschen alter Trainings kann ihn ändern. Die manuell gewählte Fitnessstufe deiner Figur ist davon unabhängig.</span></li>
          <li><b>Verlauf korrigieren.</b><span>Im Profil unter „Verlauf“ den Eintrag über „Ändern“ oder „Löschen“ auswählen und mit der Eltern-PIN bestätigen. Laufendes Training zuerst stoppen. Bei Health-Importen aktive Minuten separat vom Start-/Endzeitfenster angeben; es bleibt bei 1,5 Punkten je aktiver Minute. Wiederholte Imports überschreiben keine Korrekturen und buchen gelöschte Einträge nicht erneut. Punkte, Minuten und Level werden neu berechnet.</span></li>
          <li><b>Optional: Mach die Figur zu deiner.</b><span>Unter „Profil bearbeiten“ kannst du ein Frontalfoto mit OpenAI oder Gemini in einen Cartoon-Kopf verwandeln. Du siehst erst eine Vorschau und entscheidest dann, ob du sie speicherst. Das Foto wird zur Verarbeitung an den gewählten Anbieter übertragen; dafür können separate API-Gebühren anfallen. Das Original bleibt nicht in FitFamily gespeichert.</span></li>
        </ol>
        <p className="user-help-note">Die KI ist eine Trainingshilfe und kein Ersatz für medizinische Beratung. Trainiere nur so, wie es sich für dich sicher anfühlt.</p>
        <button type="button" className="primary-submit" onClick={close}>Alles klar</button>
      </section>
    </Modal>}
  </>;
}
