"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Delete, Keyboard, X } from "lucide-react";
import { Modal } from "./modal";

type Field = HTMLInputElement | HTMLTextAreaElement;
const supported = new Set(["text", "email", "password", "search", "url", "tel", "number", "date", "time"]);
function editable(element: EventTarget | null): element is Field {
  return (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement && supported.has(element.type))
    && !element.matches(":disabled") && !element.readOnly && !element.closest(".touch-keyboard");
}

export function keyboardDate(digits: string): string | null {
  if (!/^\d{8}$/.test(digits)) return null;
  const day = Number(digits.slice(0, 2)), month = Number(digits.slice(2, 4)), year = Number(digits.slice(4));
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}` : null;
}

export function TouchKeyboard() {
  const field = useRef<Field | null>(null);
  const suppressed = useRef<Field | null>(null);
  const openRef = useRef(false);
  const [launchField, setLaunchField] = useState<Field | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState("text");
  const [shift, setShift] = useState(false);
  const [symbols, setSymbols] = useState(false);
  const [error, setError] = useState("");

  const begin = useCallback((target: Field) => {
    if (openRef.current || !target.isConnected || !editable(target)) return;
    field.current = target;
    setLaunchField(target);
    const type = target instanceof HTMLInputElement ? target.type : "text";
    setKind(type);
    setDraft(type === "date" ? target.value.split("-").reverse().join("") : type === "time" ? target.value.replace(":", "") : target.value);
    setLabel(target.getAttribute("aria-label") || target.labels?.[0]?.textContent?.trim() || target.placeholder || "Eingabe");
    setShift(false); setSymbols(false); setError("");
    openRef.current = true;
    setOpen(true);
  }, []);

  useEffect(() => {
    const remember = (event: FocusEvent) => {
      if (!editable(event.target) || openRef.current) return;
      field.current = event.target;
      setLaunchField(event.target);
      if (suppressed.current === event.target) return;
      if (window.innerWidth >= 901 && (navigator.maxTouchPoints > 0 || window.matchMedia?.("(any-pointer: coarse)").matches)) begin(event.target);
    };
    const touch = (event: PointerEvent) => {
      if (event.pointerType === "touch" && window.innerWidth >= 901 && editable(event.target)) {
        suppressed.current = null;
        begin(event.target);
      }
    };
    document.addEventListener("focusin", remember);
    document.addEventListener("pointerup", touch);
    return () => { document.removeEventListener("focusin", remember); document.removeEventListener("pointerup", touch); };
  }, [begin]);

  const close = useCallback(() => {
    suppressed.current = field.current;
    // Modal restores the field focus; do not immediately reopen the keyboard.
    setOpen(false);
    openRef.current = false;
    setDraft("");
  }, []);

  function apply() {
    const target = field.current;
    if (!target?.isConnected || !editable(target)) { close(); return; }
    let value = draft;
    if (kind === "date") {
      const parsed = draft ? keyboardDate(draft) : "";
      if (parsed === null) { setError("Bitte ein gültiges Datum als TT.MM.JJJJ eingeben."); return; }
      value = parsed;
    } else if (kind === "time") {
      if (draft && (!/^\d{4}$/.test(draft) || Number(draft.slice(0, 2)) > 23 || Number(draft.slice(2)) > 59)) {
        setError("Bitte eine Uhrzeit von 00:00 bis 23:59 eingeben."); return;
      }
      value = draft ? `${draft.slice(0, 2)}:${draft.slice(2)}` : "";
    } else if (kind === "number") {
      value = draft.replace(",", ".");
      if (value && !Number.isFinite(Number(value))) { setError("Bitte eine gültige Zahl eingeben."); return; }
    }
    const prototype = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(target, value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
    target.dispatchEvent(new Event("change", { bubbles: true }));
    close();
  }

  function append(key: string) {
    const limit = kind === "date" ? 8 : kind === "time" ? 4 : field.current?.maxLength && field.current.maxLength > 0 ? field.current.maxLength : 2000;
    setDraft(value => (value + (shift ? key.toUpperCase() : key)).slice(0, limit));
    setError("");
  }
  const numeric = ["date", "time", "number", "tel"].includes(kind);
  const rows = numeric ? ["123", "456", "789"] : symbols
    ? ["1234567890", "@._-+/:?!", "()[]#%&=,"]
    : ["qwertzuiop", "asdfghjkl", "yxcvbnmäöüß"];
  const display = kind === "date" ? draft.replace(/^(\d{2})(\d{0,2})(\d*)$/, (_, day, month, year) => [day, month, year].filter(Boolean).join("."))
    : kind === "time" && draft.length > 2 ? `${draft.slice(0, 2)}:${draft.slice(2)}` : draft;

  return <>
    {launchField?.isConnected && !open && createPortal(<button type="button" className="touch-keyboard-launch" aria-label="Bildschirmtastatur öffnen"
      onPointerDown={event => event.preventDefault()} onClick={() => begin(launchField)}><Keyboard size={22} /> Tastatur</button>, launchField.closest('[role="dialog"]') || document.body)}
    {open && <Modal className="touch-keyboard-backdrop" onClose={close}>
      <section className={`touch-keyboard${numeric ? " numeric" : ""}`} role="dialog" aria-modal="true" aria-labelledby="touch-keyboard-title">
        <header><h2 id="touch-keyboard-title">{label}</h2><button type="button" aria-label="Tastatur schließen" onClick={close}><X /></button></header>
        <output className="touch-keyboard-value" aria-label="Tastatureingabe">{kind === "password" ? "•".repeat(draft.length) : display || (kind === "date" ? "TT.MM.JJJJ" : kind === "time" ? "HH:MM" : "…")}</output>
        {error && <p role="alert">{error}</p>}
        {rows.map((row, index) => <div className="touch-keyboard-row" key={index}>{[...row].map(key => <button key={key} type="button" onClick={() => append(key)}>{shift ? key.toUpperCase() : key}</button>)}</div>)}
        <div className="touch-keyboard-row">
          {!numeric && <button type="button" aria-pressed={shift} onClick={() => setShift(value => !value)}>⇧</button>}
          {numeric ? <button type="button" onClick={() => append("0")}>0</button> : <>
            <button type="button" onClick={() => setSymbols(value => !value)}>{symbols ? "ABC" : "123 / @"}</button>
            <button type="button" onClick={() => append("@")}>@</button><button type="button" onClick={() => append(".")}>.</button>
            <button type="button" className="space" onClick={() => append(" ")}>Leerzeichen</button>
          </>}
          {["number", "tel"].includes(kind) && <button type="button" onClick={() => append(".")}>.</button>}
          <button type="button" aria-label="Letztes Zeichen löschen" onClick={() => setDraft(value => value.slice(0, -1))}><Delete /></button>
        </div>
        <footer><button type="button" onClick={() => { setDraft(""); setError(""); }}>Leeren</button><button type="button" onClick={close}>Abbrechen</button><button type="button" className="primary-submit" onClick={apply}>Übernehmen</button></footer>
      </section>
    </Modal>}
  </>;
}
