"use client";

import { useState } from "react";
import { MAX_MANUAL_PDF_BYTES, isStoredManualUrl, type ManualPdfUpload } from "@/lib/manual-pdf-shared";

export async function readManualPdf(file: File | null | undefined): Promise<ManualPdfUpload | undefined> {
  if (!file) return undefined;
  if (!/\.pdf$/i.test(file.name) || !file.size || file.size > MAX_MANUAL_PDF_BYTES) throw new Error("Bitte eine PDF-Datei bis 10 MiB auswählen.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Die PDF-Datei konnte nicht gelesen werden. Bitte erneut auswählen."));
    reader.readAsDataURL(file);
  });
  return { name: file.name, data };
}

export function ManualPdfField({ url, file, disabled, onUrlChange, onFileChange }: {
  url: string; file?: File | null; disabled: boolean;
  onUrlChange: (url: string) => void; onFileChange: (file: File | null) => void;
}) {
  const [error, setError] = useState("");
  return <div className="wide-field manual-pdf-field">
    <label>PDF-Anleitung hochladen<input type="file" accept="application/pdf,.pdf" disabled={disabled} onChange={event => {
      const selected = event.target.files?.[0];
      event.target.value = "";
      if (!selected) return;
      if (!/\.pdf$/i.test(selected.name) || !selected.size || selected.size > MAX_MANUAL_PDF_BYTES || selected.name.length > 200) { setError("Bitte eine PDF-Datei bis 10 MiB auswählen (Dateiname höchstens 200 Zeichen)."); return; }
      setError(""); onFileChange(selected);
    }} /></label>
    {file ? <div className="manual-pdf-selection"><span>{file.name} · {(file.size / 1024 / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MiB</span><button type="button" disabled={disabled} onClick={() => onFileChange(null)}>Auswahl verwerfen</button></div>
      : url && <div className="manual-pdf-selection"><a href={url} target="_blank" rel="noreferrer">Gespeicherte Anleitung öffnen ↗</a><button type="button" disabled={disabled} onClick={() => onUrlChange("")}>Anleitung entfernen</button></div>}
    <small>Bis 10 MiB. Die PDF wird mit „Speichern“ auf dem Server abgelegt.</small>
    {error && <p role="alert">{error}</p>}
    <label>Oder PDF-Link<input type="url" inputMode="url" disabled={disabled || Boolean(file)} maxLength={1000} placeholder="https://…/anleitung.pdf" value={isStoredManualUrl(url) ? "" : url} onChange={event => onUrlChange(event.target.value)} /></label>
  </div>;
}
