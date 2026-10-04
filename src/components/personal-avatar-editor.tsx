"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Sparkles, Trash2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { getFitnessStageCount, personalHeadLayout, type AvatarDesignId, type AvatarPhysique } from "@/lib/domain";

async function adjustedAvatarImage(source: string, scale: number, offsetX: number, offsetY: number, headWidth: number, headHeight: number) {
  const image = new window.Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Die Vorschau konnte nicht angepasst werden."));
    image.src = source;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Die Bildanpassung ist in diesem Browser nicht verfügbar.");
  const scaleOffsetX = (offsetX / headWidth) * 512;
  const scaleOffsetY = (offsetY / headHeight) * 512;
  const size = 512 * scale;
  context.drawImage(image, 256 - size / 2 + scaleOffsetX, scaleOffsetY, size, size);
  // PNG export is consistently supported by iOS Safari. Safari may silently
  // return PNG even when WebP was requested, which used to make saving fail.
  const data = canvas.toDataURL("image/png");
  if (!data.startsWith("data:image/png;base64,")) throw new Error("Das angepasste Bild konnte nicht vorbereitet werden. Bitte versuche es erneut.");
  return data;
}

export function PersonalAvatarEditor({
  profileId,
  profileName,
  avatar,
  fitnessStage,
  physique,
  birthDate,
  hasSavedAvatar,
  onSaved
}: {
  profileId: string;
  profileName: string;
  avatar: AvatarDesignId;
  fitnessStage: number;
  physique: AvatarPhysique;
  birthDate: string | null;
  hasSavedAvatar: boolean;
  onSaved: (saved: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [provider, setProvider] = useState<"openai" | "gemini">("openai");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [headScale, setHeadScale] = useState(1);
  const [headOffsetX, setHeadOffsetX] = useState(0);
  const [headOffsetY, setHeadOffsetY] = useState(0);
  const [consent, setConsent] = useState(false);
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraFileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const isChild = getFitnessStageCount(profileId, birthDate) <= 3;

  async function readAvatarResponse(response: Response, fallback: string) {
    const result = await response.json().catch(() => null) as { error?: unknown; image?: unknown } | null;
    if (!response.ok) throw new Error(typeof result?.error === "string" ? result.error : fallback);
    return result;
  }

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
    if (!photo || !consent || (isChild && !guardianConsent)) return;
    setBusy(true); setError(""); setNotice(""); setPreview("");
    const form = new FormData();
    form.set("provider", provider);
    form.set("consent", "yes");
    form.set("photo", photo);
    try {
      const response = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/avatar`, { method: "POST", body: form });
      const result = await readAvatarResponse(response, "Der Avatar konnte nicht erstellt werden.");
      if (typeof result?.image !== "string") throw new Error("Der Avatar konnte nicht erstellt werden.");
      setPreview(result.image);
      setHeadScale(1); setHeadOffsetX(0); setHeadOffsetY(0);
      setNotice("Vorschau erstellt. Prüfe, ob der Kopf gut zur Figur passt; gespeichert wird erst nach deiner Bestätigung.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Der Avatar konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!preview) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const head = personalHeadLayout(profileId, avatar);
      const adjustedImage = await adjustedAvatarImage(preview, headScale, headOffsetX, headOffsetY, head.width, head.height);
      const response = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/avatar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", image: adjustedImage })
      });
      await readAvatarResponse(response, "Der Avatar konnte nicht gespeichert werden.");
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
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/profiles/${encodeURIComponent(profileId)}/avatar`, {
        method: "DELETE"
      });
      await readAvatarResponse(response, "Der KI-Avatar konnte nicht entfernt werden.");
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
        <p>Wähle ein klares Frontalfoto. Die KI macht daraus einen passend zugeschnittenen Cartoon-Kopf. Hals und Körper bleiben aus derselben FitFamily-Figur, damit sie bei allen Fitnessstufen zusammenpassen. Das Originalfoto wird nur zur Umwandlung verwendet und nicht in FitFamily gespeichert.</p>
        <label>Bild hochladen
          <input ref={fileRef} type="file" accept="image/*" onChange={(event) => selectPhoto(event.target.files?.[0] ?? null)} />
        </label>
        <input ref={cameraFileRef} hidden type="file" accept="image/*" capture="user" onChange={(event) => { selectPhoto(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} aria-label="Foto mit der Frontkamera aufnehmen" />
        {!cameraOpen && <button type="button" className="personal-avatar-camera-open" onClick={() => {
          if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) cameraFileRef.current?.click();
          else void openCamera();
        }}><Camera size={16} /> Foto mit Kamera aufnehmen</button>}
        {cameraOpen && <div className="personal-avatar-camera">
          <video ref={videoRef} autoPlay muted playsInline aria-label="Livebild der Kamera" />
          <div><button type="button" onClick={() => void capturePhoto()}><Camera size={16} /> Foto aufnehmen</button><button type="button" className="personal-avatar-camera-cancel" onClick={stopCamera}>Kamera schließen</button></div>
        </div>}
        <small className="personal-avatar-camera-hint">Auf dem Handy öffnet der Kameraknopf direkt die Kamera. Am Computer gibt es ein Livebild, wenn FitFamily über HTTPS geöffnet ist.</small>
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
        <div className="personal-avatar-actions">
          <button type="button" onClick={() => void generate()} disabled={busy || !photo || !consent || (isChild && !guardianConsent)}>
            <Sparkles size={16} /> {busy ? "Avatar wird erstellt …" : "Vorschau erstellen"}
          </button>
          {hasSavedAvatar && <button type="button" className="personal-avatar-remove" onClick={() => void remove()} disabled={busy}><Trash2 size={16} /> KI-Avatar entfernen</button>}
        </div>
        {preview && <div className="personal-avatar-preview">
          <div className="personal-avatar-sample"><Avatar id={profileId} name={profileName} avatar={avatar} customAvatar customAvatarSrc={preview} customAvatarScale={headScale} customAvatarOffsetX={headOffsetX} customAvatarOffsetY={headOffsetY} fitnessStage={fitnessStage} physique={physique} birthDate={birthDate} size="large" /></div>
          <div><b>Kopf passend einstellen</b><p>Ziehe die Regler, bis Kopf und Hals sauber sitzen. Die Anpassung wird mit dem Avatar gespeichert.</p>
            <div className="personal-avatar-adjustments">
              <label>Kopfgröße <output>{Math.round(headScale * 100)} %</output><input type="range" min="75" max="135" step="1" value={Math.round(headScale * 100)} onChange={(event) => setHeadScale(Number(event.target.value) / 100)} /></label>
              <label>Waagerecht <output>{headOffsetX > 0 ? "+" : ""}{headOffsetX} %</output><input type="range" min="-12" max="12" step="1" value={headOffsetX} onChange={(event) => setHeadOffsetX(Number(event.target.value))} /></label>
              <label>Senkrecht <output>{headOffsetY > 0 ? "+" : ""}{headOffsetY} %</output><input type="range" min="-12" max="12" step="1" value={headOffsetY} onChange={(event) => setHeadOffsetY(Number(event.target.value))} /></label>
              <button type="button" className="personal-avatar-adjust-reset" onClick={() => { setHeadScale(1); setHeadOffsetX(0); setHeadOffsetY(0); }}>Auf Ausgangsposition zurücksetzen</button>
            </div>
            <p>Wenn dir die Vorschau gefällt, speichere sie ausdrücklich. Sonst bleibt deine aktuelle Figur unverändert.</p>
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
