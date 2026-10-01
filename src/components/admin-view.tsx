"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { ArrowLeft, AlertTriangle, Bot, CheckCircle2, Database, Download, HardDrive, Lock, Monitor, Moon, Plus, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Sun } from "lucide-react";
import { TouchPinpad } from "@/components/touch-pinpad";
import { showToast } from "@/components/toast";
import { applyTheme, getStoredThemeSetting, subscribeTheme, type ThemeSetting } from "@/lib/theme";
import { DEFAULT_DISPLAY_SETTINGS, type DisplaySettings } from "@/lib/display-settings-shared";

type AiUsage = { requests: number; inputTokens: number; outputTokens: number; estimateUsd: number; updatedAt: string | null };
type Status = { openai: boolean; gemini: boolean; nas: boolean; models: { openai: string; gemini: string }; usage: { openai: AiUsage; gemini: AiUsage } };
type ExerciseMedia = { id: string; name: string; equipment: string; videoUrl: string | null };
type EquipmentItem = { id: string; name: string; quantity: number; available: boolean; videoUrl?: string | null };
type UpdateInfo = { currentCommit: string; latestCommit: string; latestMessage: string; hasUpdate: boolean; version: string; latestVersion?: string };
type BackupInfo = { name: string; sizeBytes: number; sizeFormatted: string; date: string };
type BackupStatus = {
  configured: boolean;
  path: string;
  hasEncryptionKey: boolean;
  accessible: boolean;
  writable: boolean;
  statusMessage: string;
  backupCount: number;
  lastBackup: BackupInfo | null;
};

type ConfirmModalConfig = {
  title: string;
  badge?: string;
  description: string;
  icon: "update" | "backup" | "reset" | "key";
  confirmLabel: string;
  confirmVariant?: "primary" | "danger" | "brand";
  action: () => Promise<void> | void;
};

export function AdminView({ profiles, exercises, equipment }: { profiles: { id: string; name: string; score: number }[]; exercises: ExerciseMedia[]; equipment: EquipmentItem[] }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmModal, setConfirmModal] = useState<ConfirmModalConfig | null>(null);
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>(() => Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise.videoUrl ?? ""])));
  const [savingVideo, setSavingVideo] = useState<string | null>(null);
  const [equipmentItems, setEquipmentItems] = useState(equipment);
  const [equipmentEdits, setEquipmentEdits] = useState<Record<string, EquipmentItem>>(() => Object.fromEntries(equipment.map((item) => [item.id, item])));
  const [savingEquipment, setSavingEquipment] = useState<string | null>(null);
  const [newEquipmentName, setNewEquipmentName] = useState("");
  const [newEquipmentQuantity, setNewEquipmentQuantity] = useState(1);
  const [apiKeys, setApiKeys] = useState({ openai: "", gemini: "" });
  const [savingApi, setSavingApi] = useState<string | null>(null);

  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("fitfamily_display_settings");
        if (stored) return { ...DEFAULT_DISPLAY_SETTINGS, ...JSON.parse(stored) };
      } catch {}
    }
    return DEFAULT_DISPLAY_SETTINGS;
  });
  const [savingDisplay, setSavingDisplay] = useState(false);
  const [subpageTimeout, setSubpageTimeout] = useState(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("fitfamily_subpage_idle_timeout");
      return stored ? Number(stored) : 60;
    }
    return 60;
  });

  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null);
  const [nasPathInput, setNasPathInput] = useState("");
  const [nasKeyInput, setNasKeyInput] = useState("");
  const [showAdvancedNas, setShowAdvancedNas] = useState(false);
  const [savingNas, setSavingNas] = useState(false);
  const [testingNas, setTestingNas] = useState(false);
  const [runningBackup, setRunningBackup] = useState(false);
  const [showNasMountForm, setShowNasMountForm] = useState(false);
  const [nasServerInput, setNasServerInput] = useState("");
  const [nasShareInput, setNasShareInput] = useState("");
  const [nasUserInput, setNasUserInput] = useState("");
  const [nasPassInput, setNasPassInput] = useState("");
  const [mountingNas, setMountingNas] = useState(false);

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [runningUpdate, setRunningUpdate] = useState(false);
  const [updateCountdown, setUpdateCountdown] = useState<number | null>(null);

  const currentTheme = useSyncExternalStore(
    subscribeTheme,
    () => {
      if (typeof document === "undefined") return "system";
      const attr = document.documentElement.getAttribute("data-theme-setting");
      if (attr === "system" || attr === "light" || attr === "dark") return attr as ThemeSetting;
      return getStoredThemeSetting();
    },
    () => "system" as ThemeSetting
  );

  async function checkUpdate(effectivePin?: string) {
    const pinToUse = effectivePin || pin;
    if (!pinToUse) return;
    setCheckingUpdate(true);
    try {
      const response = await fetch(`/api/admin/update?pin=${encodeURIComponent(pinToUse)}`);
      const data = await response.json();
      if (response.ok) {
        setUpdateInfo(data);
      } else {
        setNotice(data.error ?? "Update-Prüfung fehlgeschlagen.");
      }
    } catch {
      setNotice("Update-Server konnte nicht erreicht werden.");
    } finally {
      setCheckingUpdate(false);
    }
  }

  function requestApplyUpdate() {
    setConfirmModal({
      title: "1-Click Update einspielen?",
      badge: updateInfo?.latestCommit ? `Rev. ${updateInfo.latestCommit}` : "Systemupdate",
      description: "Ein automatisches Sicherheits-Backup der Datenbank wird erstellt. Die neueste Version wird von GitHub geladen, gebaut und das Dashboard wird neu gestartet.",
      icon: "update",
      confirmLabel: "Update jetzt einspielen",
      confirmVariant: "brand",
      action: () => executeApplyUpdate()
    });
  }

  async function executeApplyUpdate() {
    setRunningUpdate(true);
    setNotice("Update wird ausgeführt: Neueste Version wird geladen und neu gebaut. Bitte kurz warten …");
    try {
      const response = await fetch("/api/admin/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      const data = await response.json();
      if (!response.ok) {
        const errorMsg = data.error ?? "Update fehlgeschlagen.";
        setNotice(errorMsg);
        showToast({ type: "error", title: "Update fehlgeschlagen", message: errorMsg });
        setRunningUpdate(false);
        return;
      }
      setNotice("Update erfolgreich abgeschlossen! Dashboard startet neu …");
      showToast({ type: "success", title: "Update installiert", message: "Das Dashboard wird neu geladen." });
      let countdown = 6;
      setUpdateCountdown(countdown);
      const timer = setInterval(() => {
        countdown -= 1;
        setUpdateCountdown(countdown);
        if (countdown <= 0) {
          clearInterval(timer);
          window.location.reload();
        }
      }, 1000);
    } catch {
      setNotice("Dashboard-Dienst wird neu gestartet … Seite lädt gleich neu.");
      showToast({ type: "info", title: "Dashboard startet neu", message: "Verbindung wird neu aufgebaut." });
      setTimeout(() => window.location.reload(), 6000);
    }
  }

  async function performUnlock(pinToTest: string) {
    if (!pinToTest || pinToTest.length < 4) return;
    setVerifying(true);
    setError("");
    try {
      const response = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinToTest })
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Eltern-PIN ist falsch");
        try { sessionStorage.removeItem("fitfamily_admin_pin"); } catch {}
        setVerifying(false);
        return;
      }
      try { sessionStorage.removeItem("fitfamily_admin_pin"); } catch {}
      setStatus({ ...result.providers, usage: result.usage, models: result.models, nas: result.nas });
      if (result.backup) {
        setBackupStatus(result.backup);
        setNasPathInput(result.backup.path || "");
      }
      if (result.displaySettings) {
        setDisplaySettings(result.displaySettings);
      }
      void checkUpdate(pinToTest);
    } catch {
      setError("Verbindungsfehler beim Prüfen der PIN");
    } finally {
      setVerifying(false);
    }
  }

  async function saveDisplaySettings(changes: Partial<DisplaySettings>) {
    const updated = { ...displaySettings, ...changes };
    setDisplaySettings(updated);
    setSavingDisplay(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("fitfamily_display_settings", JSON.stringify(updated));
    }
    try {
      const response = await fetch("/api/admin/display-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, ...changes })
      });
      if (response.ok) {
        const data = await response.json();
        setDisplaySettings(data.settings);
        showToast({ type: "success", title: "Gespeichert", message: "Ruhemodus-Einstellungen wurden aktualisiert." });
      }
    } catch {
      showToast({ type: "error", title: "Fehler", message: "Einstellungen konnten nicht gespeichert werden." });
    } finally {
      setSavingDisplay(false);
    }
  }

  async function unlock(event?: React.FormEvent) {
    if (event) event.preventDefault();
    await performUnlock(pin);
  }

  async function saveNasBackupPath() {
    setSavingNas(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          action: "save",
          path: nasPathInput,
          key: nasKeyInput || undefined
        })
      });
      const data = await response.json();
      if (!response.ok) {
        const msg = data.error ?? "Fehler beim Speichern des NAS-Pfads.";
        setNotice(msg);
        showToast({ type: "error", title: "NAS-Pfad Fehler", message: msg });
      } else {
        setBackupStatus(data.status);
        if (data.status?.path) setNasPathInput(data.status.path);
        if (nasKeyInput) setNasKeyInput("");
        setStatus((cur) => (cur ? { ...cur, nas: Boolean(data.status?.writable) } : cur));
        const msg = data.message ?? "NAS-Pfad erfolgreich gespeichert.";
        setNotice(msg);
        showToast({ type: "success", title: "NAS-Pfad gespeichert", message: msg });
      }
    } catch {
      const msg = "Keine Verbindung zum Dashboard. Bitte Heimnetz prüfen.";
      setNotice(msg);
      showToast({ type: "error", title: "Verbindungsfehler", message: msg });
    } finally {
      setSavingNas(false);
    }
  }

  async function testNasBackupConnection() {
    setTestingNas(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          action: "test",
          path: nasPathInput,
          key: nasKeyInput || undefined
        })
      });
      const data = await response.json();
      if (data.status) {
        setBackupStatus(data.status);
        setStatus((cur) => (cur ? { ...cur, nas: Boolean(data.status.writable) } : cur));
      }
      if (!response.ok || !data.ok) {
        const msg = data.error ?? "Verbindung zum NAS-Ordner fehlgeschlagen.";
        setNotice(msg);
        showToast({ type: "error", title: "NAS-Test fehlgeschlagen", message: msg });
      } else {
        const msg = data.message ?? "Verbindung erfolgreich! Der NAS-Ordner ist beschreibbar.";
        setNotice(msg);
        showToast({ type: "success", title: "NAS-Verbindung erfolgreich", message: msg });
      }
    } catch {
      const msg = "Keine Verbindung zum Dashboard. Bitte Heimnetz prüfen.";
      setNotice(msg);
      showToast({ type: "error", title: "Verbindungsfehler", message: msg });
    } finally {
      setTestingNas(false);
    }
  }

  async function mountNasShare() {
    if (!nasServerInput.trim() || !nasShareInput.trim()) {
      showToast({ type: "error", title: "Fehlende Angaben", message: "Bitte Server-IP/Name und Freigabename eingeben." });
      return;
    }
    setMountingNas(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/nas-mount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          server: nasServerInput,
          share: nasShareInput,
          username: nasUserInput || undefined,
          password: nasPassInput || undefined,
          mountPath: nasPathInput.trim() || "/mnt/nas/fitfamily"
        })
      });
      const data = await response.json();
      if (response.ok && data.ok) {
        showToast({ type: "success", title: "Netzlaufwerk verbunden", message: data.message });
        setNasPathInput(data.path);
        setStatus((cur) => (cur ? { ...cur, nas: true } : cur));
        setShowNasMountForm(false);
        if (data.status) setBackupStatus(data.status);
      } else {
        const msg = data.error || "Netzlaufwerk konnte nicht eingebunden werden.";
        showToast({ type: "error", title: "Mount fehlgeschlagen", message: msg });
        setNotice(msg);
      }
    } catch {
      showToast({ type: "error", title: "Netzwerkfehler", message: "Server nicht erreichbar." });
    } finally {
      setMountingNas(false);
    }
  }

  function requestNasBackup() {
    setConfirmModal({
      title: "Datenbank-Backup erstellen?",
      badge: "Verschlüsselt",
      description: `Möchtest du jetzt sofort ein verschlüsseltes Backup der SQLite-Datenbank auf das NAS (${nasPathInput || "Standardpfad"}) schreiben?`,
      icon: "backup",
      confirmLabel: "Backup jetzt starten",
      confirmVariant: "primary",
      action: () => executeNasBackup()
    });
  }

  async function executeNasBackup() {
    setRunningBackup(true);
    setNotice("Sicherung wird erstellt und verschlüsselt auf das NAS übertragen …");
    showToast({ type: "info", title: "Backup läuft …", message: "Verschlüsseltes Backup wird übertragen." });
    try {
      const response = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          action: "backup",
          path: nasPathInput,
          key: nasKeyInput || undefined
        })
      });
      const data = await response.json();
      if (data.status) {
        setBackupStatus(data.status);
        setStatus((cur) => (cur ? { ...cur, nas: Boolean(data.status.writable) } : cur));
      }
      if (!response.ok) {
        const msg = data.error ?? "Backup fehlgeschlagen.";
        setNotice(msg);
        showToast({ type: "error", title: "Backup fehlgeschlagen", message: msg });
      } else {
        const msg = data.message ?? "Backup erfolgreich erstellt!";
        setNotice(msg);
        showToast({ type: "success", title: "Backup erstellt", message: msg });
      }
    } catch {
      const msg = "Fehler beim Erstellen des Backups. Bitte Verbindung prüfen.";
      setNotice(msg);
      showToast({ type: "error", title: "Backup-Fehler", message: msg });
    } finally {
      setRunningBackup(false);
    }
  }

  async function manageApiKey(provider: "openai" | "gemini", action: "save" | "remove" | "test") {
    setSavingApi(`${provider}-${action}`); setNotice("");
    try {
      const response = await fetch("/api/admin/ai-settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, provider, action, apiKey: apiKeys[provider] || undefined })
      });
      const result = await response.json();
      if (!response.ok) {
        const msg = result.error ?? "API-Einstellung konnte nicht verarbeitet werden.";
        setNotice(msg);
        showToast({ type: "error", title: "KI-Fehler", message: msg });
        return;
      }
      if (action === "test") {
        const msg = result.message ?? "API-Schlüssel ist gültig.";
        setNotice(msg);
        showToast({ type: "success", title: "API-Test erfolgreich", message: msg });
      } else {
        setStatus((current) => current ? { ...current, ...result.status, nas: current.nas } : current);
        if (action === "save") setApiKeys((current) => ({ ...current, [provider]: "" }));
        const msg = action === "save" ? "API-Schlüssel wurde lokal gespeichert." : "API-Schlüssel wurde entfernt.";
        setNotice(msg);
        showToast({ type: "success", title: "KI-Einstellung aktualisiert", message: msg });
      }
    } catch {
      const msg = "Keine Verbindung zum Dashboard. Bitte Heimnetz prüfen und erneut versuchen.";
      setNotice(msg);
      showToast({ type: "error", title: "Verbindungsfehler", message: msg });
    } finally {
      setSavingApi(null);
    }
  }

  function requestRemoveApiKey(provider: "openai" | "gemini") {
    setConfirmModal({
      title: `${provider === "openai" ? "OpenAI" : "Google Gemini"} Schlüssel löschen?`,
      badge: "KI-Einstellung",
      description: "Der gespeicherte API-Schlüssel wird vom Server entfernt. Künftige Trainingspläne werden dann lokal ohne externe KI generiert.",
      icon: "key",
      confirmLabel: "Schlüssel entfernen",
      confirmVariant: "danger",
      action: () => manageApiKey(provider, "remove")
    });
  }

  async function download() {
    const response = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
    if (!response.ok) {
      setNotice("Export fehlgeschlagen.");
      showToast({ type: "error", title: "Export fehlgeschlagen", message: "Daten konnten nicht exportiert werden." });
      return;
    }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `fitfamily-${new Date().toISOString().slice(0,10)}.json`; anchor.click(); URL.revokeObjectURL(url);
    setNotice("Export wurde heruntergeladen.");
    showToast({ type: "success", title: "Export erfolgreich", message: "fitfamily.json wurde heruntergeladen." });
  }

  function requestResetScore(profileId: string) {
    const prof = profiles.find((p) => p.id === profileId);
    setConfirmModal({
      title: `Score von ${prof?.name ?? "Profil"} auf 0 setzen?`,
      badge: "Verlauf bleibt erhalten",
      description: "Nur der sichtbare Punktestand wird auf 0 zurückgesetzt. Alle bisherigen Trainings, Zeiten und Statistiken im Verlauf bleiben vollständig erhalten.",
      icon: "reset",
      confirmLabel: "Score auf 0 setzen",
      confirmVariant: "danger",
      action: () => executeResetScore(profileId)
    });
  }

  async function executeResetScore(profileId: string) {
    const response = await fetch("/api/admin/reset-score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin, profileId }) });
    if (response.ok) {
      setNotice("Score wurde zurückgesetzt. Der Verlauf blieb erhalten.");
      showToast({ type: "info", title: "Score zurückgesetzt", message: "Punkte wurden auf 0 gesetzt. Verlauf bleibt erhalten." });
    } else {
      setNotice("Zurücksetzen fehlgeschlagen.");
      showToast({ type: "error", title: "Fehler beim Zurücksetzen", message: "Score konnte nicht zurückgesetzt werden." });
    }
  }

  async function saveVideo(exerciseId: string) {
    setSavingVideo(exerciseId); setNotice("");
    try {
      const response = await fetch(`/api/exercises/${exerciseId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, videoUrl: videoUrls[exerciseId]?.trim() || null })
      });
      const result = await response.json();
      if (response.ok) {
        setNotice("Video-Link gespeichert.");
        showToast({ type: "success", title: "Video gespeichert", message: "Übungsvideo wurde aktualisiert." });
      } else {
        const msg = result.error ?? "Video-Link konnte nicht gespeichert werden.";
        setNotice(msg);
        showToast({ type: "error", title: "Fehler beim Speichern", message: msg });
      }
    } catch {
      setNotice("Keine Verbindung. Bitte Heimnetz prüfen und erneut versuchen.");
      showToast({ type: "error", title: "Verbindungsfehler", message: "Keine Verbindung zum Dashboard." });
    } finally {
      setSavingVideo(null);
    }
  }

  async function saveEquipment(id: string) {
    const item = equipmentEdits[id];
    setSavingEquipment(id); setNotice("");
    try {
      const response = await fetch(`/api/equipment/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, name: item.name, quantity: item.quantity, available: item.available })
      });
      const result = await response.json();
      if (!response.ok) {
        const msg = result.error ?? "Gerät konnte nicht gespeichert werden.";
        setNotice(msg);
        showToast({ type: "error", title: "Fehler", message: msg });
        return;
      }
      setEquipmentItems((items) => items.map((entry) => entry.id === id ? result.equipment : entry));
      setEquipmentEdits((values) => ({ ...values, [id]: result.equipment }));
      setNotice("Gerätebestand gespeichert.");
      showToast({ type: "success", title: "Gerätebestand gespeichert", message: `${item.name} aktualisiert.` });
    } catch {
      setNotice("Keine Verbindung. Bitte Heimnetz prüfen und erneut versuchen.");
      showToast({ type: "error", title: "Verbindungsfehler", message: "Keine Verbindung zum Dashboard." });
    } finally {
      setSavingEquipment(null);
    }
  }

  async function addEquipment(event: React.FormEvent) {
    event.preventDefault(); setNotice("");
    try {
      const response = await fetch("/api/equipment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, name: newEquipmentName, quantity: newEquipmentQuantity })
      });
      const result = await response.json();
      if (!response.ok) {
        const msg = result.error ?? "Gerät konnte nicht ergänzt werden.";
        setNotice(msg);
        showToast({ type: "error", title: "Fehler", message: msg });
        return;
      }
      setEquipmentItems((items) => [...items, result.equipment].sort((a, b) => a.name.localeCompare(b.name, "de")));
      setEquipmentEdits((values) => ({ ...values, [result.equipment.id]: result.equipment }));
      const addedName = newEquipmentName;
      setNewEquipmentName(""); setNewEquipmentQuantity(1); setNotice("Gerät wurde ergänzt.");
      showToast({ type: "success", title: "Gerät hinzugefügt", message: `${addedName} ist nun verfügbar.` });
    } catch {
      setNotice("Keine Verbindung. Bitte Heimnetz prüfen und erneut versuchen.");
      showToast({ type: "error", title: "Verbindungsfehler", message: "Keine Verbindung zum Dashboard." });
    }
  }

  if (!status) {
    return (
      <main className="mobile-page">
        <form className="admin-login" onSubmit={unlock}>
          <div className="pair-icon">
            <ShieldCheck />
          </div>
          <span className="setup-badge">Geschützter Bereich</span>
          <h1>Verwaltung</h1>
          <p>Einstellungen, Exporte und Updates sind mit dem Eltern-PIN geschützt.</p>

          <TouchPinpad
            value={pin}
            onChange={(val) => {
              setPin(val);
              if (error) setError("");
            }}
            disabled={verifying}
          />

          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Eltern-PIN"
            style={{ position: "absolute", opacity: 0, pointerEvents: "none", height: 0, width: 0 }}
            maxLength={4}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
          />

          {error && <p className="form-error">{error}</p>}
          <button className="primary-submit" disabled={verifying || pin.length < 4}>
            {verifying ? "Wird geprüft …" : "Entsperren"}
          </button>
          <Link href="/">
            <ArrowLeft /> Dashboard
          </Link>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header>
        <Link href="/"><ArrowLeft /> Dashboard</Link>
        <div><span>Elternbereich</span><h1>Verwaltung</h1></div>
        <button
          type="button"
          className="admin-lock-btn"
          title="Verwaltungsbereich sperren"
          onClick={() => {
            setStatus(null);
            setPin("");
            try { sessionStorage.removeItem("fitfamily_admin_pin"); } catch {}
          }}
        >
          <Lock size={15} /> Sperren
        </button>
      </header>
      {notice && <p className="notice">{notice}</p>}
    <section className="admin-grid">
      <article><div className="admin-title"><Database /><div><h2>Meine Daten</h2><p>Vollständiger lokaler Datenbestand</p></div></div><ul><li><CheckCircle2 /> Profildaten und Geburtsdaten</li><li><CheckCircle2 /> Trainings- und Punkteverlauf</li><li><CheckCircle2 /> Pläne und Änderungsprotokoll</li></ul><button onClick={download}><Download /> JSON herunterladen</button></article>
      <article className="screensaver-card">
        <div className="admin-title">
          <Moon />
          <div>
            <h2>Design & Ruhemodus</h2>
            <p>Farbschema, Inaktivität und Nachtruhe</p>
          </div>
        </div>

        <div style={{ marginTop: "10px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 750, color: "var(--muted)", marginBottom: "6px" }}>
            Design & Farbschema:
          </label>
          <div className="timeout-pills">
            {[
              { label: "System (Auto)", val: "system" as const, icon: <Monitor size={14} /> },
              { label: "Hell", val: "light" as const, icon: <Sun size={14} /> },
              { label: "Dunkel", val: "dark" as const, icon: <Moon size={14} /> }
            ].map(({ label, val, icon }) => (
              <button
                key={val}
                type="button"
                className={`timeout-pill ${currentTheme === val ? "active" : ""}`}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                onClick={() => {
                  applyTheme(val);
                  showToast({ type: "success", title: "Design aktualisiert", message: `Farbschema auf "${label}" gesetzt.` });
                }}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: "14px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 750, color: "var(--muted)", marginBottom: "6px" }}>
            ☀️ Tagsüber: Ruhemodus nach Inaktivität:
          </label>
          <div className="timeout-pills">
            {[
              { label: "1 Min.", val: 1 },
              { label: "2 Min.", val: 2 },
              { label: "5 Min.", val: 5 },
              { label: "10 Min.", val: 10 },
              { label: "15 Min.", val: 15 },
              { label: "30 Min.", val: 30 },
              { label: "Aus", val: 0 }
            ].map(({ label, val }) => (
              <button
                key={val}
                type="button"
                className={`timeout-pill ${displaySettings.idleTimeoutMinutes === val ? "active" : ""}`}
                disabled={savingDisplay}
                onClick={() => void saveDisplaySettings({ idleTimeoutMinutes: val })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: "14px", padding: "12px", borderRadius: "14px", background: "var(--subtle-bg)", border: "1px solid var(--line)" }}>
          <label className="night-mode-toggle-wrap" style={{ margin: 0, padding: 0 }}>
            <input
              type="checkbox"
              checked={displaySettings.nightModeEnabled}
              disabled={savingDisplay}
              onChange={(e) => void saveDisplaySettings({ nightModeEnabled: e.target.checked })}
            />
            <div style={{ fontSize: "12px" }}>
              <strong>🌙 Nachtruhe-Modus aktivieren</strong>
              <small style={{ display: "block", color: "var(--muted)", marginTop: "2px" }}>
                Separates Verhalten und Zeitfenster für die Nacht
              </small>
            </div>
          </label>

          {displaySettings.nightModeEnabled && (
            <div style={{ marginTop: "12px", display: "grid", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--muted)", marginBottom: "6px" }}>
                  Nachts aktivieren nach Inaktivität:
                </label>
                <div className="timeout-pills">
                  {[
                    { label: "1 Min.", val: 1 },
                    { label: "2 Min.", val: 2 },
                    { label: "5 Min.", val: 5 },
                    { label: "10 Min.", val: 10 },
                    { label: "Aus", val: 0 }
                  ].map(({ label, val }) => (
                    <button
                      key={val}
                      type="button"
                      className={`timeout-pill ${displaySettings.nightIdleTimeoutMinutes === val ? "active" : ""}`}
                      disabled={savingDisplay}
                      onClick={() => void saveDisplaySettings({ nightIdleTimeoutMinutes: val })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--muted)", marginBottom: "6px" }}>
                  Nachtruhe-Zeitfenster:
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>Von</span>
                  <input
                    type="time"
                    value={displaySettings.nightStartTime || "22:30"}
                    disabled={savingDisplay}
                    onChange={(e) => void saveDisplaySettings({ nightStartTime: e.target.value })}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "10px",
                      border: "1px solid var(--line)",
                      background: "var(--input-bg)",
                      color: "var(--text)",
                      fontSize: "13px",
                      fontWeight: 700
                    }}
                  />
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>bis</span>
                  <input
                    type="time"
                    value={displaySettings.nightEndTime || "06:30"}
                    disabled={savingDisplay}
                    onChange={(e) => void saveDisplaySettings({ nightEndTime: e.target.value })}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "10px",
                      border: "1px solid var(--line)",
                      background: "var(--input-bg)",
                      color: "var(--text)",
                      fontSize: "13px",
                      fontWeight: 700
                    }}
                  />
                  <span style={{ fontSize: "12px", color: "var(--muted)" }}>Uhr</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: "14px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 750, color: "var(--muted)", marginBottom: "6px" }}>
            ⏱️ Unterseiten: Dashboard-Rückkehr nach Inaktivität:
          </label>
          <div className="timeout-pills">
            {[
              { label: "30 Sek.", val: 30 },
              { label: "60 Sek.", val: 60 },
              { label: "90 Sek.", val: 90 },
              { label: "2 Min.", val: 120 },
              { label: "5 Min.", val: 300 },
              { label: "Aus", val: 0 }
            ].map(({ label, val }) => (
              <button
                key={val}
                type="button"
                className={`timeout-pill ${subpageTimeout === val ? "active" : ""}`}
                onClick={() => {
                  setSubpageTimeout(val);
                  if (typeof window !== "undefined") {
                    localStorage.setItem("fitfamily_subpage_idle_timeout", String(val));
                  }
                  showToast({ type: "success", title: "Einstellung gespeichert", message: `Unterseiten-Rückkehr auf "${label}" gesetzt.` });
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: "12px" }}>
          <button
            type="button"
            className="update-secondary-btn"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => {
              if (typeof window !== "undefined") {
                sessionStorage.setItem("fitfamily_test_quiet", "1");
                router.push("/");
              }
            }}
          >
            <Sparkles size={16} />
            <span>Ruhemodus jetzt testen</span>
          </button>
        </div>
      </article>
      <article className="wide update-card">
        <div className="admin-title"><RefreshCw className={checkingUpdate || runningUpdate ? "spin" : ""} /><div><h2>Software-Update</h2><p>Dashboard auf den neuesten Stand von GitHub bringen</p></div></div>
        <div className="update-status-grid">
          <div className="update-meta-box"><span>Installierte Version</span><b>v{updateInfo?.version ?? "0.1.0"} {updateInfo?.currentCommit ? `(Rev. ${updateInfo.currentCommit})` : ""}</b></div>
          <div className="update-meta-box"><span>GitHub Repository</span><b className={updateInfo?.hasUpdate ? "update-tag-new" : "update-tag-current"}>{updateInfo ? (updateInfo.hasUpdate ? `Neues Update verfügbar (Rev. ${updateInfo.latestCommit})` : `Aktuell (Rev. ${updateInfo.latestCommit})`) : (checkingUpdate ? "Prüfung läuft …" : "Noch nicht geprüft")}</b></div>
        </div>
        {updateInfo?.hasUpdate && (
          <div className="update-alert-banner"><Sparkles /><div><div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}><b>Neues Update bereit zur Installation</b><span style={{ fontSize: "11px", fontWeight: "800", padding: "2px 8px", borderRadius: "999px", background: "var(--brand)", color: "#ffffff" }}>Rev. {updateInfo.latestCommit}</span></div><p className="update-commit-log">&bdquo;{updateInfo.latestMessage}&ldquo;</p></div></div>
        )}
        <div className="update-action-row">
          <button type="button" className="update-secondary-btn" disabled={checkingUpdate || runningUpdate} onClick={() => void checkUpdate()}><RefreshCw className={checkingUpdate ? "spin" : ""} />{checkingUpdate ? "Prüfe …" : "Jetzt prüfen"}</button>
          {updateInfo?.hasUpdate && (
            <button type="button" className="primary-update-btn" disabled={runningUpdate} onClick={requestApplyUpdate}>{runningUpdate ? (<><RefreshCw className="spin" />Wird aktualisiert & neu gebaut …</>) : (<><Sparkles />1-Click Update einspielen (Rev. {updateInfo.latestCommit})</>)}</button>
          )}
        </div>
        {updateCountdown !== null && (
          <div className="update-countdown-alert">Dienst wurde neu gestartet. Das Dashboard lädt neu in <b>{updateCountdown}</b> Sekunden …</div>
        )}
        <p className="data-text">Vor dem Einspielen wird automatisch ein SQLite-Backup unter <code>backups/</code> angelegt. Alternativ im Terminal per <code>sudo /opt/fitfamily/scripts/update.sh</code> oder <code>npm run update</code>.</p>
      </article>
      <article className="wide"><div className="admin-title"><Bot /><div><h2>KI-Integrationen</h2><p>API-Schlüssel lokal auf diesem Gerät speichern – ohne Code oder Serverdatei.</p></div></div>
        {(["openai", "gemini"] as const).map((provider) => {
          const usage = status.usage[provider];
          const label = provider === "openai" ? "OpenAI" : "Google Gemini";
          return <section className="ai-provider" key={provider}>
            <div className="ai-provider-heading"><div><b>{label}</b><small>{status.models[provider]}</small></div><b className={status[provider] ? "ok" : "off"}>{status[provider] ? "Eingerichtet" : "Nicht eingerichtet"}</b></div>
            <label className="api-key-field">API-Schlüssel<input type="password" autoComplete="new-password" placeholder={status[provider] ? "Gespeichert – leer lassen, um ihn beizubehalten" : "Schlüssel hier einfügen"} value={apiKeys[provider]} onChange={(event) => setApiKeys((current) => ({ ...current, [provider]: event.target.value }))} /></label>
            <div className="api-key-actions"><button disabled={Boolean(savingApi)} onClick={() => manageApiKey(provider, "save")}>Schlüssel speichern</button><button disabled={Boolean(savingApi)} onClick={() => manageApiKey(provider, "test")}>Schlüssel testen</button>{status[provider] && <button className="api-remove" disabled={Boolean(savingApi)} onClick={() => requestRemoveApiKey(provider)}>Entfernen</button>}</div>
            <div className="ai-usage"><b>{usage.estimateUsd.toLocaleString("de-DE", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 })}</b><span>geschätzte API-Kosten · {usage.requests} Anfragen · {(usage.inputTokens + usage.outputTokens).toLocaleString("de-DE")} Token</span></div>
          </section>;
        })}
        <p className="data-text">Die Verbrauchserfassung beginnt ab jetzt und umfasst nur KI-Pläne, die über diese App erstellt werden. Die Kostenschätzung nutzt die erfassten Token und aktuelle Standardpreise; sie kann von der Anbieterabrechnung abweichen und zeigt keine frühere Nutzung. <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer">OpenAI-Preise</a> · <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">Gemini-Preise</a>.</p>
      </article>
      <article className="wide backup-card">
        <div className="admin-title">
          <HardDrive className={runningBackup || testingNas ? "spin" : ""} />
          <div>
            <h2>NAS-Datensicherung</h2>
            <p>Automatisches und manuelles Backup der Datenbank auf deine Netzwerkfreigabe</p>
          </div>
        </div>

        <div className="update-status-grid">
          <div className="update-meta-box">
            <span>Status</span>
            <b className={
              backupStatus?.writable
                ? "backup-status-tag-ok"
                : (backupStatus?.configured ? "backup-status-tag-error" : "backup-status-tag-off")
            }>
              {backupStatus?.writable
                ? "Bereit & Beschreibbar"
                : (backupStatus?.configured ? "Pfad nicht beschreibbar" : "Nicht eingerichtet")}
            </b>
            <small style={{ display: "block", marginTop: "4px", fontSize: "11px", color: "var(--muted)" }}>
              {backupStatus?.statusMessage ?? "Kein Pfad hinterlegt."}
            </small>
          </div>

          <div className="update-meta-box">
            <span>Letztes Backup</span>
            <b>
              {backupStatus?.lastBackup
                ? `${backupStatus.lastBackup.sizeFormatted}`
                : "Noch keins vorhanden"}
            </b>
            <small style={{ display: "block", marginTop: "4px", fontSize: "11px", color: "var(--muted)" }}>
              {backupStatus?.lastBackup
                ? `${backupStatus.lastBackup.name} (${new Date(backupStatus.lastBackup.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })})`
                : `${backupStatus?.backupCount ?? 0} Sicherungen`}
            </small>
          </div>
        </div>

        <label className="api-key-field" style={{ marginTop: "16px" }}>
          NAS-Sicherungspfad (lokaler Einhängepfad)
          <input
            type="text"
            placeholder="/mnt/nas/fitfamily oder /volume1/backup/fitfamily"
            value={nasPathInput}
            onChange={(e) => setNasPathInput(e.target.value)}
          />
        </label>

        <div style={{ marginTop: "6px" }}>
          <button
            type="button"
            className="backup-advanced-toggle"
            style={{ fontSize: "12px", color: "var(--brand)", background: "transparent", border: 0, padding: 0, cursor: "pointer", fontWeight: 700 }}
            onClick={() => setShowNasMountForm((prev) => !prev)}
          >
            {showNasMountForm ? "▾ Netzlaufwerk-Assistent schließen" : "▸ Netzlaufwerk (SMB/CIFS) automatisch einhängen"}
          </button>

          {showNasMountForm && (
            <div style={{ marginTop: "10px", padding: "14px", border: "1px solid var(--line)", borderRadius: "12px", background: "var(--subtle-bg)", display: "grid", gap: "10px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)" }}>
                NAS-Freigabe direkt über das Frontend mounten:
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <label className="api-key-field" style={{ margin: 0 }}>
                  Server / IP
                  <input
                    type="text"
                    placeholder="192.168.1.100 oder diskstation"
                    value={nasServerInput}
                    onChange={(e) => setNasServerInput(e.target.value)}
                  />
                </label>
                <label className="api-key-field" style={{ margin: 0 }}>
                  Freigabename (Share)
                  <input
                    type="text"
                    placeholder="fitfamily oder backup"
                    value={nasShareInput}
                    onChange={(e) => setNasShareInput(e.target.value)}
                  />
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <label className="api-key-field" style={{ margin: 0 }}>
                  Benutzername (optional)
                  <input
                    type="text"
                    placeholder="z. B. admin"
                    value={nasUserInput}
                    onChange={(e) => setNasUserInput(e.target.value)}
                  />
                </label>
                <label className="api-key-field" style={{ margin: 0 }}>
                  Passwort (optional)
                  <input
                    type="password"
                    placeholder="Passwort"
                    value={nasPassInput}
                    onChange={(e) => setNasPassInput(e.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="update-secondary-btn"
                style={{ justifySelf: "start", marginTop: "4px" }}
                disabled={mountingNas || !nasServerInput.trim() || !nasShareInput.trim()}
                onClick={() => void mountNasShare()}
              >
                <HardDrive className={mountingNas ? "spin" : ""} size={16} />
                <span>{mountingNas ? "Verbinde Netzlaufwerk …" : "Netzlaufwerk jetzt verbinden & mounten"}</span>
              </button>
            </div>
          )}
        </div>

        <div className="update-action-row">
          <button
            type="button"
            className="update-secondary-btn"
            disabled={savingNas || testingNas || runningBackup}
            onClick={() => void saveNasBackupPath()}
          >
            {savingNas ? "Speichert …" : "Pfad speichern"}
          </button>

          <button
            type="button"
            className="update-secondary-btn"
            disabled={savingNas || testingNas || runningBackup || !nasPathInput.trim()}
            onClick={() => void testNasBackupConnection()}
          >
            <RefreshCw className={testingNas ? "spin" : ""} />
            {testingNas ? "Prüfe Zugriff …" : "Verbindung testen"}
          </button>

          <button
            type="button"
            className="primary-update-btn"
            disabled={savingNas || testingNas || runningBackup || !backupStatus?.writable}
            onClick={requestNasBackup}
          >
            <HardDrive className={runningBackup ? "spin" : ""} />
            {runningBackup ? "Backup wird erstellt …" : "Jetzt sichern"}
          </button>
        </div>

        <button
          type="button"
          className="backup-advanced-toggle"
          onClick={() => setShowAdvancedNas((prev) => !prev)}
        >
          {showAdvancedNas ? "▾" : "▸"} Verschlüsselung (AES-256-GCM) anpassen
        </button>

        {showAdvancedNas && (
          <div style={{ marginTop: "10px", padding: "12px", border: "1px solid var(--line)", borderRadius: "12px", background: "var(--subtle-bg)" }}>
            <label className="api-key-field" style={{ marginTop: 0 }}>
              Backup-Passphrase (mindestens 16 Zeichen)
              <input
                type="password"
                autoComplete="new-password"
                placeholder={backupStatus?.hasEncryptionKey ? "Schlüssel aktiv (leer lassen zum Beibehalten)" : "Optionaler eigener Schlüssel"}
                value={nasKeyInput}
                onChange={(e) => setNasKeyInput(e.target.value)}
              />
            </label>
            <p className="data-text" style={{ fontSize: "11px", marginTop: "6px" }}>
              Backups werden standardmäßig mit einem sicheren AES-256-GCM-Schlüssel verschlüsselt. Wenn du hier einen eigenen Schlüssel einträgst, wird dieser für künftige Sicherungen genutzt.
            </p>
          </div>
        )}

        <p className="data-text" style={{ marginTop: "14px" }}>
          Sichert den vollständigen Datenbestand verschlüsselt ab. Alte Stände werden automatisch nach 7 Tagen, 4 Wochen und 12 Monaten rotiert.
        </p>
      </article>
      <article className="wide"><div className="admin-title"><RotateCcw /><div><h2>Scores zurücksetzen</h2><p>Der vollständige Trainingsverlauf bleibt erhalten.</p></div></div><div className="reset-list">{profiles.map((profile) => <div key={profile.id}><span>{profile.name}<small>{profile.score} Punkte</small></span><button onClick={() => requestResetScore(profile.id)}>Auf 0 setzen</button></div>)}</div></article>
      <article className="wide"><div className="admin-title"><HardDrive /><div><h2>Speicherorte</h2><p>Transparenz über vorhandene Daten</p></div></div><p className="data-text">Stammdaten, Training und Pläne: lokale SQLite-Datenbank · Backups: {status.nas ? "verschlüsselt auf NAS" : "noch nicht eingerichtet"} · Wetter: Open-Meteo · KI: nur bei bewusster Planerstellung.</p></article>
      <article className="wide"><div className="admin-title"><Database /><div><h2>Geräte im Sportraum</h2><p>Stückzahl und Verfügbarkeit für Übungsauswahl und neue Trainingspläne</p></div></div><div className="inventory-list">{equipmentItems.map((item) => { const edit = equipmentEdits[item.id] ?? item; return <div className="inventory-row" key={item.id}><label>Gerätename<input value={edit.name} maxLength={60} onChange={(event) => setEquipmentEdits((values) => ({ ...values, [item.id]: { ...edit, name: event.target.value } }))} /></label><label className="quantity-field">Anzahl<input type="number" min={1} max={8} value={edit.quantity} onChange={(event) => setEquipmentEdits((values) => ({ ...values, [item.id]: { ...edit, quantity: Number(event.target.value) } }))} /></label><label className="inventory-toggle"><input type="checkbox" checked={edit.available} onChange={(event) => setEquipmentEdits((values) => ({ ...values, [item.id]: { ...edit, available: event.target.checked } }))} /> Verfügbar</label><button disabled={savingEquipment === item.id} onClick={() => saveEquipment(item.id)}>{savingEquipment === item.id ? "Speichert …" : "Speichern"}</button></div>; })}</div><form className="inventory-add" onSubmit={addEquipment}><label>Weiteres Gerät<input required minLength={2} maxLength={60} placeholder="z. B. Hantelbank" value={newEquipmentName} onChange={(event) => setNewEquipmentName(event.target.value)} /></label><label className="quantity-field">Anzahl<input type="number" min={1} max={8} value={newEquipmentQuantity} onChange={(event) => setNewEquipmentQuantity(Number(event.target.value))} /></label><button><Plus /> Gerät ergänzen</button></form><p className="data-text">Deaktivierte Geräte bleiben im bisherigen Trainingsverlauf erhalten, werden aber künftig nicht zur Auswahl angeboten.</p></article>
      <article className="wide"><div className="admin-title"><CheckCircle2 /><div><h2>Übungsvideos</h2><p>Eigene YouTube-Anleitungen pro Übung hinterlegen; leere Felder zeigen eine YouTube-Suche.</p></div></div><div className="exercise-media-list">{exercises.map((exercise) => <div key={exercise.id}><label><span>{exercise.name}<small>{exercise.equipment}</small></span><input type="url" inputMode="url" placeholder="https://youtube.com/..." value={videoUrls[exercise.id] ?? ""} onChange={(event) => setVideoUrls((values) => ({ ...values, [exercise.id]: event.target.value }))} /></label><button disabled={savingVideo === exercise.id} onClick={() => saveVideo(exercise.id)}>{savingVideo === exercise.id ? "Speichert …" : "Speichern"}</button></div>)}</div></article>
    </section>

      {confirmModal && (
        <div className="modal-backdrop" onClick={() => setConfirmModal(null)}>
          <div className="confirm-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button type="button" className="modal-close" onClick={() => setConfirmModal(null)} aria-label="Schließen">×</button>
            <div className="confirm-modal-top">
              {confirmModal.badge && <span className="setup-badge">{confirmModal.badge}</span>}
              <div className={`confirm-modal-icon ${confirmModal.confirmVariant ?? "primary"}`}>
                {confirmModal.icon === "update" && <Sparkles size={28} />}
                {confirmModal.icon === "backup" && <Database size={28} />}
                {confirmModal.icon === "reset" && <RotateCcw size={28} />}
                {confirmModal.icon === "key" && <AlertTriangle size={28} />}
              </div>
            </div>
            <h3>{confirmModal.title}</h3>
            <p>{confirmModal.description}</p>
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="confirm-cancel-btn"
                onClick={() => setConfirmModal(null)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className={`confirm-submit-btn ${confirmModal.confirmVariant ?? "primary"}`}
                onClick={async () => {
                  const act = confirmModal.action;
                  setConfirmModal(null);
                  await act();
                }}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
