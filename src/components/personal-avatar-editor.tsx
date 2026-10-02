"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Sparkles, Trash2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { getFitnessStageCount, type AvatarDesignId, type AvatarPhysique } from "@/lib/domain";

export function PersonalAvatarEditor({
  profileId,
  profileName,
  avatar,
  fitnessStage,
  physique,
  birthDate,
  pin,
  setPin,
  hasSavedAvatar,
  onSaved
}: {
  profileId: string;
  profileName: string;
  avatar: AvatarDesignId;
  fitnessStage: number;
  physique: AvatarPhysique;
  birthDate: string | null;
  pin: string;
  setPin: (pin: string) => void;
  hasSavedAvatar: boolean;
  onSaved: (saved: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [provider, setProvider] = useState<"openai" | "gemini">("openai");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [consent, setConsent] = useState(false);
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const isChild = getFitnessStageCount(profileId, birthDate) <= 3;

  function stopCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  }

  useEffect(() => {
    if (!cameraOpen || !videoRef.current || !cameraStreamRef.current) return;
    videoRef.current.srcObject = cameraStreamRef.current;
    void videoRef.current.play().catch(() => setError("Das Kamerabild konnte nicht gestartet werden. Bitte prüfe die Browser-Berechtigung oder lade ein Bild hoch."));
  }, [cameraOpen]);

  useEffect(() => () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function openCamera() {
    setError(""); setNotice("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Der Browser erlaubt hier keinen direkten Kamerazugriff. Öffne FitFamily über HTTPS oder lade stattdessen ein Bild hoch.");
      return;
    }
    try {
      cameraStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "user" }, width: { ideal: 1280 }, height: { ideal: 1280 } }
      });
      setCameraOpen(true);
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : "";
      setError(name === "NotAllowedError"
        ? "Der Kamerazugriff wurde nicht erlaubt. Erlaube der Website die Kameranutzung oder lade ein Bild hoch."
        : name === "NotFoundError"
          ? "Es wurde keine Kamera gefunden. Du kannst stattdessen ein Bild hochladen."
          : "Die Kamera konnte nicht geöffnet werden. Prüfe die Browser-Berechtigung oder lade ein Bild hoch.");
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setError("Das Kamerabild ist noch nicht bereit. Bitte kurz warten und erneut versuchen.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!image) {
      setError("Das Kamerafoto konnte nicht verarbeitet werden. Du kannst stattdessen ein Bild hochladen.");
      return;
    }
    setPhoto(new File([image], "fitfamily-kamerafoto.jpg", { type: "image/jpeg" }));
    setPreview(""); setError("");
    setNotice("Kamerafoto aufgenommen. Du kannst jetzt die Vorschau erstellen.");
    stopCamera();
  }

  function selectPhoto(file: File | null) {
    stopCamera();
    setPhoto(file); setPreview(""); setError(""); setNotice("");
  }

  async function generate() {
    if (!photo || !consent || (isChild && !guardianConsent) || pin.length !== 4) return;
    setBusy(true); setError(""); setNotice(""); setPreview("");
    const form = new FormData();
    form.set("provider", provider);
    form.set("pin", pin);
    form.set("consent", "yes");
    form.set("photo", photo);
    try {
      const response = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/avatar`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok || typeof result.image !== "string") throw new Error(result.error ?? "Der Avatar konnte nicht erstellt werden.");
      setPreview(result.image);
      setNotice("Vorschau erstellt. Prüfe, ob der Kopf gut zur Figur passt; gespeichert wird erst nach deiner Bestätigung.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Der Avatar konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!preview || pin.length !== 4) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/avatar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", pin, image: preview })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Der Avatar konnte nicht gespeichert werden.");
      onSaved(true);
      setPreview("");
      setNotice("Dein KI-Avatar ist jetzt gespeichert und wird auf dem Dashboard angezeigt.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Der Avatar konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (pin.length !== 4) { setError("Bitte zuerst die vierstellige Eltern-PIN eingeben."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/avatar`, {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Der KI-Avatar konnte nicht entfernt werden.");
      onSaved(false);
      setPreview("");
      setNotice("Der persönliche Avatar wurde entfernt. Die ausgewählte Standardfigur bleibt erhalten.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Der KI-Avatar konnte nicht entfernt werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="personal-avatar-editor">
      <button type="button" className="personal-avatar-toggle" aria-expanded={expanded} onClick={() => { if (expanded) stopCamera(); setExpanded((value) => !value); }}>
        <Sparkles size={17} /> {hasSavedAvatar ? "Eigenen KI-Avatar ansehen oder ändern" : "Eigenen KI-Avatar erstellen"}
      </button>
      {expanded && <div className="personal-avatar-content">
        <p>Wähle ein klares Frontalfoto. Die KI macht daraus einen Cartoon-Kopf im Stil der FitFamily-Figuren und setzt ihn auf den Körper. Das Originalfoto wird nur für die Umwandlung verwendet und nicht in FitFamily gespeichert. Der fertige Kopf bleibt in deinem Profil gespeichert.</p>
        <label>Bild hochladen
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectPhoto(event.target.files?.[0] ?? null)} />
        </label>
        {!cameraOpen && <button type="button" className="personal-avatar-camera-open" onClick={() => void openCamera()}><Camera size={16} /> Foto mit Kamera aufnehmen</button>}
        {cameraOpen && <div className="personal-avatar-camera">
          <video ref={videoRef} autoPlay muted playsInline aria-label="Livebild der Kamera" />
          <div><button type="button" onClick={() => void capturePhoto()}><Camera size={16} /> Foto aufnehmen</button><button type="button" className="personal-avatar-camera-cancel" onClick={stopCamera}>Kamera schließen</button></div>
        </div>}
        <small className="personal-avatar-camera-hint">Die Kamera benötigt HTTPS (oder localhost). Über eine normale HTTP-IP-Adresse klappt der Zugriff möglicherweise nicht; Bild-Upload bleibt verfügbar.</small>
        {photo && <small className="personal-avatar-selected-photo">Ausgewählt: {photo.name}</small>}
        <label>KI-Anbieter
          <select value={provider} onChange={(event) => setProvider(event.target.value as "openai" | "gemini")}>
            <option value="openai">ChatGPT / OpenAI</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </label>
        <label className="personal-avatar-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          Ich darf dieses Foto verwenden und stimme zu, dass es zur KI-Verarbeitung an den ausgewählten Anbieter gesendet wird. Es können Anbietergebühren anfallen.
        </label>
        {isChild && <label className="personal-avatar-consent"><input type="checkbox" checked={guardianConsent} onChange={(event) => setGuardianConsent(event.target.checked)} />
          Ich bin sorgeberechtigt und stimme der KI-Verarbeitung dieses Kinderfotos zu.
        </label>}
        <label>Eltern-PIN · 4 Ziffern
          <input type="password" inputMode="numeric" autoComplete="current-password" maxLength={4} pattern="[0-9]{4}" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Für Foto-Umwandlung und Speichern" />
        </label>
        <div className="personal-avatar-actions">
          <button type="button" onClick={() => void generate()} disabled={busy || !photo || !consent || (isChild && !guardianConsent) || pin.length !== 4}>
            <Sparkles size={16} /> {busy ? "Avatar wird erstellt …" : "Vorschau erstellen"}
          </button>
          {hasSavedAvatar && <button type="button" className="personal-avatar-remove" onClick={() => void remove()} disabled={busy}><Trash2 size={16} /> KI-Avatar entfernen</button>}
        </div>
        {preview && <div className="personal-avatar-preview">
          <div className="personal-avatar-sample"><Avatar id={profileId} name={profileName} avatar={avatar} customAvatar customAvatarSrc={preview} fitnessStage={fitnessStage} physique={physique} birthDate={birthDate} size="medium" /></div>
          <div><b>So sieht es im Dashboard aus</b><p>Wenn dir das Ergebnis gefällt, speichere es ausdrücklich. Sonst bleibt deine aktuelle Figur unverändert.</p>
            <button type="button" onClick={() => void save()} disabled={busy}>{busy ? "Speichert …" : "Diesen Avatar speichern"}</button>
            <button type="button" className="personal-avatar-cancel" onClick={() => { setPreview(""); setNotice("Vorschau verworfen."); }} disabled={busy}>Vorschau verwerfen</button>
          </div>
        </div>}
        {notice && <p className="personal-avatar-notice" role="status">{notice}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {hasSavedAvatar && <p className="personal-avatar-footnote">Dein gespeicherter KI-Kopf wird auch auf den verschiedenen Fitnessstufen angezeigt.</p>}
      </div>}
    </section>
  );
}
