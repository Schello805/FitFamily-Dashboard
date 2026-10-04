"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "./modal";
import { HEALTH_RECORDING_QUESTION, type RecordingMode } from "@/lib/recording-mode";

export function useRecordingChoice() {
  const [open, setOpen] = useState(false);
  const resolve = useRef<((mode: RecordingMode | null) => void) | null>(null);
  useEffect(() => () => { resolve.current?.(null); resolve.current = null; }, []);
  function choose(mode: RecordingMode | null) {
    setOpen(false); resolve.current?.(mode); resolve.current = null;
  }
  const ask = useCallback(() => {
    if (resolve.current) return Promise.resolve(null);
    setOpen(true);
    return new Promise<RecordingMode | null>(done => { resolve.current = done; });
  }, []);
  return { ask, open, dialog: open ? <Modal onClose={() => choose(null)}>
    <section className="recording-choice" role="dialog" aria-modal="true" aria-labelledby="recording-question">
      <h2 id="recording-question">{HEALTH_RECORDING_QUESTION}</h2>
      <p>Diese Auswahl verhindert, dass dieselbe Trainingszeit zweimal gewertet wird. Bei „Ja“ dient der App-Timer nur zur Orientierung; erst ein importierter Trainingsdatensatz zählt mit 1,5 Punkten pro aktiver Minute. Die Watch-Aufzeichnung allein überträgt noch nichts.</p>
      <p>Bei „Nein“ zählt die aktive App-Trainingszeit. Nur die Watch zu tragen bedeutet nicht „Ja“. kcal und Schritte kommen unabhängig davon per Kurzbefehl, ohne Wertung. Einzelne Trainings importierst du später über „Health-Training importieren“ in deinem Profil.</p>
      <button type="button" onClick={() => choose("health")}>Ja · nur importierte Trainingszeit werten</button>
      <button type="button" onClick={() => choose("app")}>Nein · App-Trainingszeit werten</button>
      <button type="button" onClick={() => choose(null)}>Abbrechen</button>
    </section>
  </Modal> : null };
}
