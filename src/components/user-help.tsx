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
          <li><b>Wähle dein Profil.</b><span>Dein Dashboard zeigt deine Trainingspunkte, dein Bewegungsziel und deinen Verlauf. Unter „Profil bearbeiten“ kannst du Fitnessstufe und Figur selbst einstellen.</span></li>
          <li><b>Starte eine Übung oder erstelle einen Plan.</b><span>Wähle im Profil entweder den Direktstart über „Kraft“ oder „Ausdauer“ oder deinen persönlichen KI-Trainingsplan. Beim KI-Plan gibst du Ziel, Trainingsstand, Häufigkeit und Dauer an; berücksichtigt werden die verfügbaren Geräte. Du kannst auch ohne KI planen.</span></li>
          <li><b>Trainiere und beende die Einheit.</b><span>Wähle eine Übung für Video oder Anleitung, starte das Training und beende es nachher mit „Beenden“ oder „Stopp“. FitFamily speichert die Einheit für deinen Verlauf und Score. Falsch gestartete Einträge kannst du im Verlauf nachträglich bearbeiten oder löschen.</span></li>
          <li><b>Sieh dir deine Entwicklung an.</b><span>Auf dem Dashboard findest du Bewegungsziel, Trainingsminuten und Punkte. Im Profil kannst du deinen Trainingsverlauf ansehen.</span></li>
          <li><b>Optional: Mach die Figur zu deiner.</b><span>Unter „Profil bearbeiten“ kannst du ein Frontalfoto mit OpenAI oder Gemini in einen Cartoon-Kopf verwandeln. Du siehst erst eine Vorschau und entscheidest dann, ob du sie speicherst. Das Foto wird zur Verarbeitung an den gewählten Anbieter übertragen; dafür können separate API-Gebühren anfallen. Das Original bleibt nicht in FitFamily gespeichert.</span></li>
        </ol>
        <p className="user-help-note">Die KI ist eine Trainingshilfe und kein Ersatz für medizinische Beratung. Trainiere nur so, wie es sich für dich sicher anfühlt.</p>
        <button type="button" className="primary-submit" onClick={close}>Alles klar</button>
      </section>
    </Modal>}
  </>;
}
