"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowLeft, AlertTriangle, Bot, CheckCircle2, ClipboardList, Copy, Database, Download, HardDrive, Lock, Monitor, Moon, Plus, RefreshCw, RotateCcw, ShieldCheck, Sparkles, Sun, Upload, Users, Wrench, X } from "lucide-react";
import { TouchPinpad } from "@/components/touch-pinpad";
import { AvatarPicker } from "@/components/avatar-picker";
import { avatarAssetForProfile, GOALS, type AvatarId, type ProfileAvatar } from "@/lib/domain";
import { showToast } from "@/components/toast";
import { applyTheme, getStoredThemeSetting, subscribeTheme, type ThemeSetting } from "@/lib/theme";
import { DEFAULT_DISPLAY_SETTINGS, type DisplaySettings } from "@/lib/display-settings-shared";

type AiUsage = { requests: number; inputTokens: number; outputTokens: number; estimateUsd: number; updatedAt: string | null };
type Status = { openai: boolean; gemini: boolean; nas: boolean; models: { openai: string; gemini: string }; usage: { openai: AiUsage; gemini: AiUsage } };
type ExerciseMedia = { id: string; name: string; type: "strength" | "endurance"; equipment: string; instructions: string; safetyNotes: string; videoUrl: string | null; active: boolean };
type EquipmentItem = { id: string; name: string; quantity: number; available: boolean; active: boolean; videoUrl?: string | null; instructions?: string | null };
type AdminProfile = { id: string; name: string; score: number; email: string | null; birthDate: string | null; startingFitness: number; avatar: ProfileAvatar; goal: string };
type ExerciseDraft = { name: string; type: "strength" | "endurance"; equipment: string; instructions: string; safetyNotes: string; videoUrl: string };
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
type AdminLogFilter = "all" | "errors" | "updates" | "backups";
type AdminLogEntry = { id: string; action: string; createdAt: string; details: Record<string, unknown> };
type SystemStatus = {
  database: { kind: "local" | "remote"; location: string; sizeBytes: number | null; error: string | null };
  applicationVolume: { availableBytes: number | null; totalBytes: number | null; error: string | null };
  backupVolume: { availableBytes: number | null; totalBytes: number | null; error: string | null } | null;
};

type ConfirmModalConfig = {
  title: string;
  badge?: string;
  description: string;
  icon: "update" | "backup" | "reset" | "key";
  confirmLabel: string;
  confirmVariant?: "primary" | "danger" | "brand";
  requiresPin?: boolean;
  action: (freshPin?: string) => Promise<void> | void;
};

const ADMIN_SESSION_STORAGE_KEY = "fitfamily_admin_session";
const ADMIN_SESSION_DURATION_MS = 60 * 60 * 1000;

function calculateAge(birthDate: string) {
  const birth = new Date(`${birthDate}T00:00:00`);
  if (!Number.isFinite(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}

type AdminSection = "allgemein" | "ki" | "sicherung" | "daten" | "protokolle" | "sportraum" | "familie";

const ADMIN_SECTIONS: { id: AdminSection; label: string; detail: string; icon: typeof Monitor }[] = [
  { id: "allgemein", label: "Allgemein", detail: "Design & Updates", icon: Monitor },
  { id: "ki", label: "KI-Integrationen", detail: "Schlüssel & Kosten", icon: Bot },
  { id: "sicherung", label: "Datensicherung", detail: "NAS & Speicherorte", icon: HardDrive },
  { id: "daten", label: "Daten & Speicher", detail: "Export, Import, Platz", icon: Database },
  { id: "protokolle", label: "Protokolle", detail: "Fehler, Updates, Backup", icon: ClipboardList },
  { id: "sportraum", label: "Sportraum", detail: "Geräte & Videos", icon: Wrench },
  { id: "familie", label: "Familie", detail: "Score-Verwaltung", icon: Users }
];

export function AdminView({
  profiles,
  exercises,
  equipment,
  initialVersion = "0.2.17",
  initialCommit
}: {
  profiles: AdminProfile[];
  exercises: ExerciseMedia[];
  equipment: EquipmentItem[];
  initialVersion?: string;
  initialCommit?: string;
}) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [authExpiresAt, setAuthExpiresAt] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [activeAdminSection, setActiveAdminSection] = useState<AdminSection>("allgemein");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [profileScores, setProfileScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(profiles.map((p) => [p.id, p.score]))
  );
  const [confirmModal, setConfirmModal] = useState<ConfirmModalConfig | null>(null);
  const [confirmPin, setConfirmPin] = useState("");
  const [confirmPinError, setConfirmPinError] = useState("");
  const [verifyingConfirmPin, setVerifyingConfirmPin] = useState(false);
  const [exerciseItems, setExerciseItems] = useState(exercises);
  const [exerciseEdits, setExerciseEdits] = useState<Record<string, ExerciseMedia>>(() => Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise])));
  const [savingExercise, setSavingExercise] = useState<string | null>(null);
  const [exerciseModalId, setExerciseModalId] = useState<string | null>(null);
  const [showExerciseCreateModal, setShowExerciseCreateModal] = useState(false);
  const [newExercise, setNewExercise] = useState<ExerciseDraft>({ name: "", type: "strength", equipment: "", instructions: "", safetyNotes: "", videoUrl: "" });
  const [equipmentItems, setEquipmentItems] = useState(equipment);
  const [equipmentEdits, setEquipmentEdits] = useState<Record<string, EquipmentItem>>(() => Object.fromEntries(equipment.map((item) => [item.id, item])));
  const [savingEquipment, setSavingEquipment] = useState<string | null>(null);
  const [newEquipmentName, setNewEquipmentName] = useState("");
  const [newEquipmentQuantity, setNewEquipmentQuantity] = useState(1);
  const [newEquipmentVideoUrl, setNewEquipmentVideoUrl] = useState("");
  const [newEquipmentInstructions, setNewEquipmentInstructions] = useState("");
  const [showEquipmentCreateModal, setShowEquipmentCreateModal] = useState(false);
  const [equipmentModalId, setEquipmentModalId] = useState<string | null>(null);
  const [familyItems, setFamilyItems] = useState(profiles);
  const [familyModalId, setFamilyModalId] = useState<string | null>(null);
  const [familyDraft, setFamilyDraft] = useState<AdminProfile | null>(null);
  const [savingFamily, setSavingFamily] = useState(false);
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
  const [adminLogs, setAdminLogs] = useState<AdminLogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<AdminLogFilter>("all");
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [copyingLogs, setCopyingLogs] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loadingSystemStatus, setLoadingSystemStatus] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPayload, setImportPayload] = useState<unknown>(null);
  const [importValidation, setImportValidation] = useState<{ valid: boolean; total: number; counts: Record<string, number>; errors: string[] } | null>(null);
  const [validatingImport, setValidatingImport] = useState(false);
  const [importingData, setImportingData] = useState(false);

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [runningUpdate, setRunningUpdate] = useState(false);
  const [updateCountdown, setUpdateCountdown] = useState<number | null>(null);
  const currentInstalledVersion = updateInfo?.version ?? initialVersion;
  const currentInstalledCommit = updateInfo?.currentCommit ?? initialCommit;

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
      const response = await fetch(`/api/admin/update?pin=${encodeURIComponent(pinToUse)}`, { cache: "no-store" });
      const data = await response.json();
      if (response.ok) {
        setUpdateInfo(data);
      } else {
        const errorMessage = data.error ?? "Update-Prüfung fehlgeschlagen.";
        setNotice(errorMessage);
        showToast({ type: "error", title: "Update-Prüfung fehlgeschlagen", message: errorMessage });
      }
    } catch {
      setNotice("Update-Server konnte nicht erreicht werden.");
    } finally {
      setCheckingUpdate(false);
    }
  }

  const [postUpdateSuccess, setPostUpdateSuccess] = useState<{ version?: string; commit?: string } | null>(null);

  function waitForServerAndReload() {
    setNotice("Dashboard-Dienst startet neu … Stelle Verbindung wieder her …");
    let attempts = 0;
    const pollTimer = setInterval(async () => {
      attempts += 1;
      try {
        const res = await fetch("/api/dashboard", { cache: "no-store" });
        if (res.ok) {
          clearInterval(pollTimer);
          window.location.reload();
        }
      } catch {
        // Noch beim Booten
      }
      if (attempts >= 25) {
        clearInterval(pollTimer);
        window.location.reload();
      }
    }, 1500);
  }

  function requestApplyUpdate() {
    setConfirmPin("");
    setConfirmPinError("");
    setConfirmModal({
      title: "Update installieren?",
      badge: updateInfo?.latestCommit ? `Build ${updateInfo.latestCommit}` : undefined,
      description: "Vorher wird eine Datenbanksicherung erstellt. Danach wird das Update installiert und das Dashboard neu gestartet. Währenddessen ist es kurz nicht erreichbar.",
      icon: "update",
      confirmLabel: "Jetzt installieren",
      confirmVariant: "brand",
      requiresPin: false,
      action: (freshPin) => executeApplyUpdate(freshPin)
    });
  }

  async function executeApplyUpdate(freshPin = pin) {
    setRunningUpdate(true);
    setNotice("Update läuft. Das kann einige Minuten dauern; das Dashboard startet danach automatisch neu.");
    try {
      const response = await fetch("/api/admin/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: freshPin })
      });
      const data = await response.json();
      if (!response.ok) {
        const errorMsg = data.error ?? "Update fehlgeschlagen.";
        setNotice(errorMsg);
        showToast({ type: "error", title: "Update fehlgeschlagen", message: errorMsg });
        setRunningUpdate(false);
        return;
      }
      try {
        sessionStorage.setItem("fitfamily_last_update_status", JSON.stringify({
          timestamp: Date.now(),
          targetCommit: data.newCommit || updateInfo?.latestCommit || currentInstalledCommit || "",
          targetVersion: data.newVersion || updateInfo?.latestVersion || currentInstalledVersion
        }));
      } catch {}
      setNotice("Update erfolgreich abgeschlossen! Dashboard startet neu …");
      showToast({ type: "success", title: "Update installiert", message: "Das Dashboard startet neu und wird geladen." });
      let countdown = 6;
      setUpdateCountdown(countdown);
      const timer = setInterval(() => {
        countdown -= 1;
        setUpdateCountdown(countdown);
        if (countdown <= 0) {
          clearInterval(timer);
          waitForServerAndReload();
        }
      }, 1000);
    } catch {
      try {
        sessionStorage.setItem("fitfamily_last_update_status", JSON.stringify({
          timestamp: Date.now(),
          targetCommit: updateInfo?.latestCommit || currentInstalledCommit || "",
          targetVersion: updateInfo?.latestVersion || currentInstalledVersion
        }));
      } catch {}
      setNotice("Dashboard-Dienst wird neu gestartet … Seite lädt gleich neu.");
      showToast({ type: "info", title: "Dashboard startet neu", message: "Verbindung wird neu aufgebaut." });
      waitForServerAndReload();
    }
  }

  useEffect(() => {
    let restoreTimer: number | undefined;
    try {
      const stored = sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
      if (!stored) return;
      const session = JSON.parse(stored) as { pin?: unknown; expiresAt?: unknown };
      if (typeof session.pin !== "string" || !/^\d{4}$/.test(session.pin) || typeof session.expiresAt !== "number" || session.expiresAt <= Date.now()) {
        sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
        return;
      }
      restoreTimer = window.setTimeout(() => {
        setPin(session.pin as string);
        setAuthExpiresAt(session.expiresAt as number);
        void performUnlock(session.pin as string, session.expiresAt as number);
      }, 0);
    } catch {
      try { sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY); } catch {}
    }
    return () => { if (restoreTimer !== undefined) window.clearTimeout(restoreTimer); };
    // This is a one-time restoration from this tab's sessionStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authExpiresAt) return;
    const lock = () => {
      setStatus(null);
      setPin("");
      setAuthExpiresAt(null);
      try { sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY); } catch {}
    };
    const remaining = authExpiresAt - Date.now();
    if (remaining <= 0) {
      lock();
      return;
    }
    const timeout = window.setTimeout(lock, remaining);
    return () => window.clearTimeout(timeout);
  }, [authExpiresAt]);

  async function performUnlock(pinToTest: string, existingExpiry?: number) {
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
        try { sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY); } catch {}
        setVerifying(false);
        return;
      }
      const expiresAt = existingExpiry && existingExpiry > Date.now() ? existingExpiry : Date.now() + ADMIN_SESSION_DURATION_MS;
      setAuthExpiresAt(expiresAt);
      try {
        sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify({ pin: pinToTest, expiresAt }));
      } catch {}
      try {
        const updateDoneRaw = sessionStorage.getItem("fitfamily_last_update_status");
        if (updateDoneRaw) {
          sessionStorage.removeItem("fitfamily_last_update_status");
          const meta = JSON.parse(updateDoneRaw);
          setPostUpdateSuccess({
            version: meta.targetVersion || currentInstalledVersion,
            commit: meta.targetCommit || ""
          });
          showToast({
            type: "sparkles",
            title: "🎉 Update erfolgreich installiert!",
            message: `Das Dashboard läuft jetzt auf Version v${meta.targetVersion || "0.2.15"}${meta.targetCommit ? ` (Rev. ${meta.targetCommit})` : ""}.`
          });
        }
      } catch {}
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
        showToast({ type: "success", title: "NAS-Zugriff verfügbar", message: msg });
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
        showToast({ type: "success", title: "API-Schlüssel gültig", message: msg });
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

  async function loadAdminLogs(filter: AdminLogFilter = logFilter) {
    setLoadingLogs(true);
    try {
      const response = await fetch("/api/admin/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, filter })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Protokolle konnten nicht geladen werden.");
      setAdminLogs(Array.isArray(result.logs) ? result.logs : []);
    } catch (loadError) {
      showToast({ type: "error", title: "Protokolle nicht verfügbar", message: loadError instanceof Error ? loadError.message : "Keine Verbindung zum Dashboard." });
    } finally {
      setLoadingLogs(false);
    }
  }

  async function copyAdminLogs() {
    const text = adminLogs.map((entry) => {
      const timestamp = new Date(entry.createdAt.replace(" ", "T") + (entry.createdAt.endsWith("Z") ? "" : "Z")).toLocaleString("de-DE");
      const level = entry.details.level === "error" ? "FEHLER" : entry.details.level === "warning" ? "WARNUNG" : "INFO";
      const message = typeof entry.details.message === "string" ? entry.details.message : entry.action;
      return `[${timestamp}] ${level} · ${message}`;
    }).join("\n");
    if (!text) {
      showToast({ type: "info", title: "Keine Einträge", message: "Für diesen Filter gibt es keine Protokolleinträge." });
      return;
    }
    setCopyingLogs(true);
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const field = document.createElement("textarea");
        field.value = text;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        if (!copied) throw new Error("Zwischenablage nicht verfügbar.");
      }
      showToast({ type: "success", title: "Protokoll kopiert", message: `${adminLogs.length} Einträge in die Zwischenablage kopiert.` });
    } catch {
      showToast({ type: "error", title: "Kopieren nicht möglich", message: "Bitte Browser-Zugriff auf die Zwischenablage erlauben." });
    } finally {
      setCopyingLogs(false);
    }
  }

  async function refreshSystemStatus() {
    setLoadingSystemStatus(true);
    try {
      const response = await fetch("/api/admin/system-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Speicherstatus konnte nicht geladen werden.");
      setSystemStatus(result);
    } catch (statusError) {
      showToast({ type: "error", title: "Speicherstatus nicht verfügbar", message: statusError instanceof Error ? statusError.message : "Keine Verbindung zum Dashboard." });
    } finally {
      setLoadingSystemStatus(false);
    }
  }

  async function validateImportFile() {
    if (!importFile) return;
    if (importFile.size > 15 * 1024 * 1024) {
      setImportValidation({ valid: false, total: 0, counts: {}, errors: ["Die Datei ist größer als 15 MB."] });
      setImportPayload(null);
      return;
    }
    setValidatingImport(true);
    setImportValidation(null);
    try {
      const parsedFile: unknown = JSON.parse(await importFile.text());
      const response = await fetch("/api/admin/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, action: "validate", backup: parsedFile })
      });
      const result = await response.json();
      if (!response.ok && !Array.isArray(result.errors)) throw new Error(result.error ?? "Datei konnte nicht geprüft werden.");
      const valid = response.ok && Boolean(result.valid);
      setImportPayload(valid ? parsedFile : null);
      setImportValidation({ valid, total: Number(result.total ?? 0), counts: result.counts ?? {}, errors: result.errors ?? [] });
    } catch (validationError) {
      setImportPayload(null);
      setImportValidation({ valid: false, total: 0, counts: {}, errors: [validationError instanceof Error ? validationError.message : "Die Datei ist kein lesbares JSON."] });
    } finally {
      setValidatingImport(false);
    }
  }

  function requestDataImport() {
    if (!importPayload || !importValidation?.valid) return;
    setConfirmPin("");
    setConfirmPinError("");
    setConfirmModal({
      title: "Geprüfte Daten übernehmen?",
      badge: "Zusammenführen · kein Löschen",
      description: `Es werden bis zu ${importValidation.total} geprüfte Datensätze aus „${importFile?.name ?? "FitFamily-Export"}“ ergänzt oder anhand ihrer IDs aktualisiert. Nicht enthaltene lokale Einträge bleiben bestehen. PIN erneut eingeben, um fortzufahren.`,
      icon: "backup",
      confirmLabel: "Daten übernehmen",
      confirmVariant: "primary",
      requiresPin: true,
      action: (freshPin) => executeDataImport(freshPin)
    });
  }

  async function executeDataImport(freshPin?: string) {
    if (!importPayload) return;
    setImportingData(true);
    try {
      const response = await fetch("/api/admin/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: freshPin || pin, action: "import", backup: importPayload })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Import fehlgeschlagen.");
      setNotice(result.message ?? "Daten wurden übernommen.");
      showToast({ type: "success", title: "Import abgeschlossen", message: `${result.total ?? 0} Datensätze geprüft und übernommen.` });
      setImportFile(null);
      setImportPayload(null);
      setImportValidation(null);
      router.refresh();
    } catch (importError) {
      showToast({ type: "error", title: "Import fehlgeschlagen", message: importError instanceof Error ? importError.message : "Keine Verbindung zum Dashboard." });
    } finally {
      setImportingData(false);
    }
  }

  function formatStorage(bytes: number | null | undefined) {
    if (bytes == null || !Number.isFinite(bytes)) return "Nicht ermittelbar";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} KiB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MiB`;
    if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toLocaleString("de-DE", { maximumFractionDigits: 2 })} GiB`;
    return `${(bytes / 1024 ** 4).toLocaleString("de-DE", { maximumFractionDigits: 2 })} TiB`;
  }

  async function download() {
    try {
      const response = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? "Daten konnten nicht exportiert werden.");
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `fitfamily-${new Date().toISOString().slice(0,10)}.json`; anchor.click(); URL.revokeObjectURL(url);
      setNotice("Export wurde heruntergeladen.");
      showToast({ type: "success", title: "Export erfolgreich", message: "FitFamily-Daten wurden heruntergeladen; Zugangsschlüssel sind nicht enthalten." });
    } catch (exportError) {
      setNotice("Export fehlgeschlagen.");
      showToast({ type: "error", title: "Export fehlgeschlagen", message: exportError instanceof Error ? exportError.message : "Daten konnten nicht exportiert werden." });
    }
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
    const prof = profiles.find((p) => p.id === profileId);
    try {
      const response = await fetch("/api/admin/reset-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, profileId })
      });
      if (response.ok) {
        setProfileScores((prev) => ({ ...prev, [profileId]: 0 }));
        setNotice(`Score von ${prof?.name ?? "Profil"} wurde auf 0 gesetzt. Der Trainingsverlauf blieb erhalten.`);
        showToast({
          type: "success",
          title: "Score zurückgesetzt",
          message: `Punkte für ${prof?.name ?? "Profil"} wurden auf 0 gesetzt. Der Verlauf bleibt erhalten.`
        });
        router.refresh();
      } else {
        const data = await response.json().catch(() => null);
        const msg = data?.error ?? "Score konnte nicht zurückgesetzt werden.";
        setNotice(msg);
        showToast({ type: "error", title: "Fehler beim Zurücksetzen", message: msg });
      }
    } catch {
      showToast({ type: "error", title: "Verbindungsfehler", message: "Server konnte nicht erreicht werden." });
    }
  }

  async function saveExercise(exerciseId: string, overrides: Partial<ExerciseMedia> = {}) {
    const exercise = { ...exerciseEdits[exerciseId], ...overrides };
    setSavingExercise(exerciseId); setNotice("");
    try {
      const response = await fetch(`/api/exercises/${exerciseId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, ...exercise, videoUrl: exercise.videoUrl?.trim() || null })
      });
      const result = await response.json();
      if (response.ok) {
        setExerciseItems((items) => items.map((item) => item.id === exerciseId ? result.exercise : item));
        setExerciseEdits((items) => ({ ...items, [exerciseId]: result.exercise }));
        setNotice("Übung und Anleitung gespeichert.");
        showToast({ type: "success", title: "Übung gespeichert", message: `${result.exercise.name} wurde aktualisiert.` });
        return true;
      } else {
        const msg = result.error ?? "Übung konnte nicht gespeichert werden.";
        setNotice(msg);
        showToast({ type: "error", title: "Fehler beim Speichern", message: msg });
        return false;
      }
    } catch {
      setNotice("Keine Verbindung. Bitte Heimnetz prüfen und erneut versuchen.");
      showToast({ type: "error", title: "Verbindungsfehler", message: "Keine Verbindung zum Dashboard." });
      return false;
    } finally {
      setSavingExercise(null);
    }
  }

  async function addExercise(event: React.FormEvent) {
    event.preventDefault(); setNotice("");
    try {
      const response = await fetch("/api/exercises", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, ...newExercise, videoUrl: newExercise.videoUrl.trim() || null })
      });
      const result = await response.json();
      if (!response.ok) {
        const message = result.error ?? "Übung konnte nicht angelegt werden.";
        setNotice(message);
        showToast({ type: "error", title: "Übung nicht angelegt", message });
        return;
      }
      setExerciseItems((items) => [...items, result.exercise].sort((a, b) => a.name.localeCompare(b.name, "de")));
      setExerciseEdits((items) => ({ ...items, [result.exercise.id]: result.exercise }));
      setNewExercise({ name: "", type: "strength", equipment: "", instructions: "", safetyNotes: "", videoUrl: "" });
      setNotice("Übung wurde angelegt.");
      showToast({ type: "success", title: "Übung angelegt", message: `${result.exercise.name} ist jetzt verfügbar.` });
      setShowExerciseCreateModal(false);
    } catch {
      showToast({ type: "error", title: "Verbindungsfehler", message: "Übung konnte nicht angelegt werden." });
    }
  }

  function requestArchiveExercise(exercise: ExerciseMedia) {
    setConfirmModal({
      title: `„${exercise.name}“ archivieren?`,
      description: "Die Übung verschwindet aus der Auswahl und aus neuen Trainingsplänen. Gespeicherte Trainings und Videos bleiben erhalten; du kannst sie später wiederherstellen.",
      icon: "key", confirmLabel: "Übung archivieren", confirmVariant: "danger", requiresPin: true,
      action: async (freshPin) => {
        try {
          const response = await fetch(`/api/exercises/${encodeURIComponent(exercise.id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: freshPin }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "Übung konnte nicht archiviert werden.");
          const updated = { ...exerciseEdits[exercise.id], active: false };
          setExerciseItems((items) => items.map((item) => item.id === exercise.id ? { ...item, active: false } : item));
          setExerciseEdits((items) => ({ ...items, [exercise.id]: updated }));
          showToast({ type: "success", title: "Übung archiviert", message: "Trainingshistorie und Anleitung bleiben erhalten." });
        } catch (error) {
          showToast({ type: "error", title: "Archivieren fehlgeschlagen", message: error instanceof Error ? error.message : "Bitte Verbindung prüfen." });
        }
      }
    });
  }

  async function saveEquipment(id: string, overrides: Partial<EquipmentItem> = {}) {
    const item = { ...equipmentEdits[id], ...overrides };
    setSavingEquipment(id); setNotice("");
    try {
      const response = await fetch(`/api/equipment/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, name: item.name, quantity: item.quantity, available: item.available, active: item.active, videoUrl: item.videoUrl?.trim() || null, instructions: item.instructions?.trim() || null })
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
      return true;
    } catch {
      setNotice("Keine Verbindung. Bitte Heimnetz prüfen und erneut versuchen.");
      showToast({ type: "error", title: "Verbindungsfehler", message: "Keine Verbindung zum Dashboard." });
      return false;
    } finally {
      setSavingEquipment(null);
    }
  }

  async function saveFamilyProfile() {
    if (!familyDraft) return;
    setSavingFamily(true);
    try {
      const response = await fetch(`/api/profiles/${encodeURIComponent(familyDraft.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, name: familyDraft.name, email: familyDraft.email?.trim() || null, birthDate: familyDraft.birthDate || null, avatar: familyDraft.avatar, startingFitness: familyDraft.startingFitness, goal: familyDraft.goal })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Profil konnte nicht gespeichert werden.");
      setFamilyItems((items) => items.map((item) => item.id === familyDraft.id ? familyDraft : item));
      showToast({ type: "success", title: "Profil gespeichert", message: `${familyDraft.name} wurde aktualisiert.` });
      setFamilyModalId(null);
      setFamilyDraft(null);
      router.refresh();
    } catch (error) {
      showToast({ type: "error", title: "Profil nicht gespeichert", message: error instanceof Error ? error.message : "Bitte Verbindung prüfen." });
    } finally {
      setSavingFamily(false);
    }
  }

  async function addEquipment(event: React.FormEvent) {
    event.preventDefault(); setNotice("");
    try {
      const response = await fetch("/api/equipment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, name: newEquipmentName, quantity: newEquipmentQuantity, videoUrl: newEquipmentVideoUrl.trim() || null, instructions: newEquipmentInstructions.trim() || null })
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
      setNewEquipmentName(""); setNewEquipmentQuantity(1); setNewEquipmentVideoUrl(""); setNewEquipmentInstructions(""); setNotice("Gerät wurde ergänzt.");
      setShowEquipmentCreateModal(false);
      showToast({ type: "success", title: "Gerät hinzugefügt", message: `${addedName} ist nun verfügbar.` });
    } catch {
      setNotice("Keine Verbindung. Bitte Heimnetz prüfen und erneut versuchen.");
      showToast({ type: "error", title: "Verbindungsfehler", message: "Keine Verbindung zum Dashboard." });
    }
  }

  function requestArchiveEquipment(item: EquipmentItem) {
    setConfirmModal({
      title: `„${item.name}“ archivieren?`,
      description: "Das Gerät wird aus neuen Trainingsplänen und der Geräteauswahl entfernt. Verknüpfte aktive Übungen müssen vorher geändert oder archiviert werden. Die Trainingshistorie bleibt erhalten.",
      icon: "key", confirmLabel: "Gerät archivieren", confirmVariant: "danger", requiresPin: true,
      action: async (freshPin) => {
        try {
          const response = await fetch(`/api/equipment/${encodeURIComponent(item.id)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: freshPin }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "Gerät konnte nicht archiviert werden.");
          setEquipmentItems((items) => items.map((entry) => entry.id === item.id ? { ...entry, active: false } : entry));
          setEquipmentEdits((items) => ({ ...items, [item.id]: { ...items[item.id], active: false } }));
          showToast({ type: "success", title: "Gerät archiviert", message: "Die Trainingshistorie bleibt erhalten." });
        } catch (error) {
          showToast({ type: "error", title: "Archivieren fehlgeschlagen", message: error instanceof Error ? error.message : "Bitte Verbindung prüfen." });
        }
      }
    });
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
          <button className="primary-submit" disabled={verifying || pin.length !== 4}>
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
            setAuthExpiresAt(null);
            try { sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY); } catch {}
          }}
        >
          <Lock size={15} /> Sperren
        </button>
      </header>
      {notice && <p className="notice">{notice}</p>}
      <div className="admin-layout">
        <nav className="admin-sidebar" aria-label="Verwaltungsbereiche">
          <p className="admin-sidebar-label">Bereiche</p>
          {ADMIN_SECTIONS.map(({ id, label, detail, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`admin-nav-item ${activeAdminSection === id ? "active" : ""}`}
              aria-current={activeAdminSection === id ? "page" : undefined}
              onClick={() => {
                setActiveAdminSection(id);
                if (id === "protokolle") void loadAdminLogs();
                if (id === "daten") void refreshSystemStatus();
              }}
            >
              <Icon aria-hidden="true" />
              <span><b>{label}</b><small>{detail}</small></span>
            </button>
          ))}
        </nav>
        <div className="admin-content">
          <div className="admin-section-heading">
            <span>Verwaltung</span>
            <h2>{ADMIN_SECTIONS.find(({ id }) => id === activeAdminSection)?.label}</h2>
          </div>
    <section className="admin-grid">
      {activeAdminSection === "allgemein" && <>
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
        {postUpdateSuccess && (
          <div className="update-alert-banner" style={{ background: "color-mix(in srgb, var(--brand) 15%, var(--subtle-bg))", borderColor: "var(--brand)", marginBottom: "16px" }}>
            <Sparkles size={24} style={{ color: "var(--brand-bright)", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <b style={{ color: "var(--text)" }}>Update erfolgreich installiert!</b>
                <span style={{ fontSize: "11px", fontWeight: "800", padding: "2px 8px", borderRadius: "999px", background: "var(--brand)", color: "#06201d" }}>
                  v{postUpdateSuccess.version}{postUpdateSuccess.commit ? ` · Build ${postUpdateSuccess.commit}` : ""}
                </span>
              </div>
              <p className="update-commit-log" style={{ margin: "4px 0 0" }}>
                Das Dashboard wurde neu gebaut, neu gestartet und läuft ab sofort auf der aktuellsten Version.
              </p>
            </div>
            <button
              type="button"
              className="modal-close"
              style={{ position: "static", width: "32px", height: "32px", fontSize: "18px" }}
              onClick={() => setPostUpdateSuccess(null)}
              aria-label="Hinweis schließen"
            >
              ×
            </button>
          </div>
        )}
        <div className="update-status-grid">
          <div className="update-meta-box"><span>Auf diesem Gerät installiert</span><b>v{currentInstalledVersion}</b>{currentInstalledCommit && <small>Build {currentInstalledCommit}</small>}</div>
          <div className="update-meta-box"><span>Neuer Stand auf GitHub</span><b className={updateInfo?.hasUpdate ? "update-tag-new" : "update-tag-current"}>{updateInfo ? (updateInfo.hasUpdate ? `Update verfügbar · v${updateInfo.latestVersion || currentInstalledVersion}` : `Auf aktuellem Stand · v${currentInstalledVersion}`) : (checkingUpdate ? "Prüfung läuft …" : "Noch nicht geprüft")}</b>{updateInfo?.latestCommit && <small>Build {updateInfo.latestCommit}</small>}</div>
        </div>
        {updateInfo?.hasUpdate && (
          <div className="update-alert-banner"><Sparkles /><div><b>Ein Update ist bereit.</b><p className="update-commit-log">Vor der Installation wird automatisch eine Sicherung deiner Daten erstellt.</p></div></div>
        )}
        <div className="update-action-row">
          <button type="button" className="update-secondary-btn" disabled={checkingUpdate || runningUpdate} onClick={() => void checkUpdate()}><RefreshCw className={checkingUpdate ? "spin" : ""} />{checkingUpdate ? "Prüfe …" : "Nach Updates suchen"}</button>
          {updateInfo?.hasUpdate && (
            <button type="button" className="primary-update-btn" disabled={runningUpdate} onClick={requestApplyUpdate}>{runningUpdate ? (<><RefreshCw className="spin" />Update läuft …</>) : (<><Sparkles />Update installieren</>)}</button>
          )}
        </div>
        {updateCountdown !== null && (
          <div className="update-countdown-alert">Dienst wurde neu gestartet. Das Dashboard lädt neu in <b>{updateCountdown}</b> Sekunden …</div>
        )}
      </article>
      </>}
      {activeAdminSection === "ki" && <>
      <article className="wide"><div className="admin-title"><Bot /><div><h2>KI-Integrationen</h2><p>API-Schlüssel lokal auf diesem Gerät speichern – ohne Code oder Serverdatei.</p></div></div>
        {(["openai", "gemini"] as const).map((provider) => {
          const usage = status.usage[provider];
          const label = provider === "openai" ? "OpenAI" : "Google Gemini";
          return <section className="ai-provider" key={provider}>
            <div className="ai-provider-heading"><div><b>{label}</b><small>{status.models[provider]}</small></div><b className={status[provider] ? "ok" : "off"}>{status[provider] ? "Eingerichtet" : "Nicht eingerichtet"}</b></div>
            <label className="api-key-field">API-Schlüssel<input type="password" autoComplete="new-password" placeholder={status[provider] ? "Gespeichert – leer lassen, um ihn beizubehalten" : "Schlüssel hier einfügen"} value={apiKeys[provider]} onChange={(event) => setApiKeys((current) => ({ ...current, [provider]: event.target.value }))} /></label>
            <div className="api-key-actions"><button disabled={Boolean(savingApi)} onClick={() => manageApiKey(provider, "save")}>Schlüssel speichern</button><button disabled={Boolean(savingApi)} onClick={() => manageApiKey(provider, "test")}>API-Zugang prüfen</button>{status[provider] && <button className="api-remove" disabled={Boolean(savingApi)} onClick={() => requestRemoveApiKey(provider)}>Entfernen</button>}</div>
            <div className="ai-usage"><b>{usage.estimateUsd.toLocaleString("de-DE", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 })}</b><span>geschätzte API-Kosten · {usage.requests} Anfragen · {(usage.inputTokens + usage.outputTokens).toLocaleString("de-DE")} Token</span></div>
          </section>;
        })}
        <p className="data-text">Die Verbrauchserfassung beginnt ab jetzt und umfasst nur KI-Pläne, die über diese App erstellt werden. Die Kostenschätzung nutzt die erfassten Token und aktuelle Standardpreise; sie kann von der Anbieterabrechnung abweichen und zeigt keine frühere Nutzung. <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer">OpenAI-Preise</a> · <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">Gemini-Preise</a>.</p>
      </article>
      </>}
      {activeAdminSection === "sicherung" && <>
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
                  Freigabe / optionaler Unterordner
                  <input
                    type="text"
                    placeholder="Public/fitfamily"
                    value={nasShareInput}
                    onChange={(e) => setNasShareInput(e.target.value)}
                  />
                  <small>Bei „Public/fitfamily“ wird die Freigabe „Public“ und darin der Ordner „fitfamily“ verwendet.</small>
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
            {testingNas ? "Prüfe Freigabe …" : "Freigabe-Zugriff prüfen"}
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
      </>}
      {activeAdminSection === "daten" && <>
        <article className="wide">
          <div className="admin-title"><HardDrive /><div><h2>Speicherstatus</h2><p>Datenbankdatei und freier Speicher auf dem Server</p></div></div>
          <div className="update-status-grid data-status-grid">
            <div className="update-meta-box"><span>Datenbank</span><b>{systemStatus ? (systemStatus.database.sizeBytes == null ? "Größe nicht ermittelbar" : formatStorage(systemStatus.database.sizeBytes)) : "Noch nicht geladen"}</b><small>{systemStatus?.database.kind === "remote" ? "Externe Datenbank" : systemStatus?.database.location ?? ""}{systemStatus?.database.error ? ` · ${systemStatus.database.error}` : ""}</small></div>
            <div className="update-meta-box"><span>Freier Speicher · App-Server</span><b>{systemStatus ? formatStorage(systemStatus.applicationVolume.availableBytes) : "Noch nicht geladen"}</b><small>{systemStatus?.applicationVolume.totalBytes != null ? `von ${formatStorage(systemStatus.applicationVolume.totalBytes)} gesamt` : systemStatus?.applicationVolume.error ?? ""}</small></div>
            {systemStatus?.backupVolume && <div className="update-meta-box"><span>Freier Speicher · NAS</span><b>{formatStorage(systemStatus.backupVolume.availableBytes)}</b><small>{systemStatus.backupVolume.totalBytes != null ? `von ${formatStorage(systemStatus.backupVolume.totalBytes)} gesamt` : systemStatus.backupVolume.error ?? ""}</small></div>}
          </div>
          <div className="data-tools-row">
            <span>{systemStatus ? "Standort und Größe werden lokal ermittelt; bei externer Datenbank kann die DB-Größe nicht ausgelesen werden." : "Speicherwerte werden nach dem Laden angezeigt."}</span>
            <button type="button" className="update-secondary-btn" disabled={loadingSystemStatus} onClick={() => void refreshSystemStatus()}><RefreshCw className={loadingSystemStatus ? "spin" : ""} /> {loadingSystemStatus ? "Wird aktualisiert …" : "Speicherstatus aktualisieren"}</button>
          </div>
        </article>

        <article>
          <div className="admin-title"><Download /><div><h2>Daten exportieren</h2><p>JSON-Datei als zusätzliche Sicherung herunterladen</p></div></div>
          <ul><li><CheckCircle2 /> Profile, Geräte, Übungen und Pläne</li><li><CheckCircle2 /> Trainings- und Apple-Health-Daten</li><li><CheckCircle2 /> Keine PIN-, KI- oder Backup-Schlüssel</li></ul>
          <button type="button" onClick={() => void download()}><Download /> JSON herunterladen</button>
        </article>

        <article>
          <div className="admin-title"><Upload /><div><h2>Daten importieren</h2><p>FitFamily-JSON vor dem Übernehmen prüfen</p></div></div>
          <label className="data-import-file">JSON-Datei auswählen<input type="file" accept=".json,application/json" onChange={(event) => { setImportFile(event.target.files?.[0] ?? null); setImportPayload(null); setImportValidation(null); }} /></label>
          <div className="data-import-actions">
            <button type="button" className="update-secondary-btn" disabled={!importFile || validatingImport} onClick={() => void validateImportFile()}>{validatingImport ? "Prüfe Datei …" : "Datei prüfen"}</button>
            <button type="button" className="primary-update-btn" disabled={!importValidation?.valid || !importPayload || importingData} onClick={requestDataImport}>{importingData ? "Import läuft …" : "Geprüfte Daten übernehmen"}</button>
          </div>
          {importValidation && <div className={`import-validation ${importValidation.valid ? "valid" : "invalid"}`} role="status">
            <b>{importValidation.valid ? `Datei gültig · ${importValidation.total} Datensätze` : "Datei konnte nicht freigegeben werden"}</b>
            {importValidation.valid && <p>{Object.entries(importValidation.counts).filter(([, count]) => count > 0).map(([name, count]) => `${name.replaceAll("_", " ")}: ${count}`).join(" · ")}</p>}
            {importValidation.errors.map((message, index) => <p key={`${index}-${message}`}>{message}</p>)}
            {importValidation.valid && <small>Der Import ergänzt oder aktualisiert gleiche IDs. Nicht enthaltene lokale Datensätze bleiben erhalten. Zugangsschlüssel werden nicht importiert.</small>}
          </div>}
        </article>
      </>}
      {activeAdminSection === "protokolle" && <>
        <article className="wide admin-logs-card">
          <div className="admin-title"><ClipboardList /><div><h2>Betriebsprotokoll</h2><p>App-Fehler sowie Update-, Export-/Import- und Backup-Ereignisse. Apple-Health-Syncs bleiben separat im Profil und PIN-geschützt.</p></div></div>
          <div className="admin-log-toolbar">
            <div className="admin-log-filters" role="group" aria-label="Protokoll filtern">
              {([{ id: "all", label: "Alle" }, { id: "errors", label: "Fehler" }, { id: "updates", label: "Updates" }, { id: "backups", label: "Backups & Daten" }] as const).map(({ id, label }) => <button key={id} type="button" className={logFilter === id ? "active" : ""} onClick={() => { setLogFilter(id); void loadAdminLogs(id); }}>{label}</button>)}
            </div>
            <div><button type="button" className="update-secondary-btn" disabled={loadingLogs} onClick={() => void loadAdminLogs()}><RefreshCw className={loadingLogs ? "spin" : ""} /> Aktualisieren</button><button type="button" className="update-secondary-btn" disabled={!adminLogs.length || copyingLogs} onClick={() => void copyAdminLogs()}><Copy /> {copyingLogs ? "Kopiere …" : "Einträge kopieren"}</button></div>
          </div>
          <p className="data-text admin-log-privacy">Bis zu 500 Einträge. Protokolle enthalten keine Health-Sync-Ereignisse und werden nur nach PIN-Freigabe geladen.</p>
          {loadingLogs ? <p className="data-text">Protokolle werden geladen …</p> : adminLogs.length ? <ol className="admin-log-list">
            {adminLogs.map((entry) => {
              const isError = entry.details.level === "error" || entry.action.endsWith(".error") || entry.action.endsWith(".failed");
              const timestamp = new Date(entry.createdAt.replace(" ", "T") + (entry.createdAt.endsWith("Z") ? "" : "Z"));
              return <li key={entry.id} className={isError ? "error" : ""}><div><span className="admin-log-level">{isError ? "FEHLER" : entry.details.level === "warning" ? "WARNUNG" : "INFO"}</span><time>{timestamp.toLocaleString("de-DE")}</time></div><b>{typeof entry.details.message === "string" ? entry.details.message : entry.action}</b><small>{entry.action}</small></li>;
            })}
          </ol> : <div className="admin-log-empty"><CheckCircle2 /><span>{logFilter === "errors" ? "Keine protokollierten Fehler gefunden." : "Für diesen Filter gibt es noch keine Einträge."}</span></div>}
        </article>
      </>}
      {activeAdminSection === "sportraum" && <>
      <article className="wide"><div className="sportraum-header"><div className="admin-title"><Database /><div><h2>Geräte im Sportraum</h2><p>Geräte, Verfügbarkeit und gerätebezogene Videos verwalten. Archivierte Einträge bleiben für die Historie erhalten.</p></div></div><button type="button" className="equipment-add-open" onClick={() => setShowEquipmentCreateModal(true)}><Plus size={17} /> Gerät hinzufügen</button></div>
        <div className="equipment-card-grid" aria-label="Geräte im Sportraum">
          {equipmentItems.map((item) => <button type="button" key={item.id} className={`equipment-card ${item.active ? "" : "archived"}`} onClick={() => { setEquipmentEdits((values) => ({ ...values, [item.id]: { ...item } })); setEquipmentModalId(item.id); }}><span>{item.name}</span><small>{item.quantity} {item.quantity === 1 ? "Stück" : "Stück"}</small></button>)}
        </div>
      </article>
      {showEquipmentCreateModal && <div className="modal-backdrop" onClick={() => setShowEquipmentCreateModal(false)}><form className="admin-edit-modal equipment-create-modal" onClick={(event) => event.stopPropagation()} onSubmit={addEquipment}><button type="button" className="modal-close" onClick={() => setShowEquipmentCreateModal(false)} aria-label="Schließen"><X /></button><span className="setup-badge">Sportraum · Neues Gerät</span><h2>Gerät hinzufügen</h2><div className="admin-edit-fields"><label>Gerätename<input autoFocus required minLength={2} maxLength={60} placeholder="z. B. Hantelbank" value={newEquipmentName} onChange={(event) => setNewEquipmentName(event.target.value)} /></label><label>Anzahl<input type="number" min={1} max={8} value={newEquipmentQuantity} onChange={(event) => setNewEquipmentQuantity(Number(event.target.value))} /></label><label className="wide-field">Anleitung<textarea rows={4} maxLength={3000} value={newEquipmentInstructions} onChange={(event) => setNewEquipmentInstructions(event.target.value)} placeholder="Hinweise zur sicheren Nutzung …" /></label><label className="wide-field">YouTube-Video<input type="url" inputMode="url" maxLength={500} placeholder="Optionaler YouTube-Link" value={newEquipmentVideoUrl} onChange={(event) => setNewEquipmentVideoUrl(event.target.value)} /></label></div><div className="exercise-admin-actions"><button type="button" className="confirm-cancel-btn" onClick={() => setShowEquipmentCreateModal(false)}>Abbrechen</button><button type="submit"><Plus size={16} /> Gerät ergänzen</button></div></form></div>}
      {equipmentModalId && equipmentEdits[equipmentModalId] && (() => { const edit = equipmentEdits[equipmentModalId]; return <div className="modal-backdrop" onClick={() => setEquipmentModalId(null)}><form className="admin-edit-modal" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void saveEquipment(edit.id).then((saved) => { if (saved) setEquipmentModalId(null); }); }}><button type="button" className="modal-close" onClick={() => setEquipmentModalId(null)} aria-label="Schließen"><X /></button><span className="setup-badge">Sportraum · Gerät</span><h2>{edit.name}</h2><div className="admin-edit-fields"><label>Gerätename<input required minLength={2} maxLength={60} value={edit.name} onChange={(event) => setEquipmentEdits((values) => ({ ...values, [edit.id]: { ...edit, name: event.target.value } }))} /></label><label>Anzahl<input type="number" min={1} max={8} value={edit.quantity} onChange={(event) => setEquipmentEdits((values) => ({ ...values, [edit.id]: { ...edit, quantity: Number(event.target.value) } }))} /></label><label className="wide-field">Anleitung<textarea rows={5} maxLength={3000} value={edit.instructions ?? ""} onChange={(event) => setEquipmentEdits((values) => ({ ...values, [edit.id]: { ...edit, instructions: event.target.value } }))} placeholder="Hinweise zur sicheren Nutzung …" /></label><label className="wide-field">YouTube-Video<input type="url" inputMode="url" maxLength={500} placeholder="https://www.youtube.com/watch?v=…" value={edit.videoUrl ?? ""} onChange={(event) => setEquipmentEdits((values) => ({ ...values, [edit.id]: { ...edit, videoUrl: event.target.value || null } }))} /></label><label className="inventory-toggle"><input type="checkbox" checked={edit.available} onChange={(event) => setEquipmentEdits((values) => ({ ...values, [edit.id]: { ...edit, available: event.target.checked } }))} /> Verfügbar</label></div><div className="exercise-admin-actions"><button type="submit" disabled={savingEquipment === edit.id}>{savingEquipment === edit.id ? "Speichert …" : "Änderungen speichern"}</button>{edit.active ? <button type="button" className="archive-action" onClick={() => requestArchiveEquipment(edit)}>Archivieren</button> : <button type="button" onClick={() => void saveEquipment(edit.id, { active: true })}>Wiederherstellen</button>}</div></form></div>; })()}
      <article className="wide"><div className="admin-title"><CheckCircle2 /><div><h2>Übungen, Anleitungen &amp; Videos</h2><p>Eigene Übungen anlegen, Gerätezuordnung und Sicherheitshinweise bearbeiten. Video-Links lassen sich ergänzen oder durch Leeren des Feldes entfernen.</p></div></div>
        <div className="exercise-admin-list">
          {exerciseItems.map((exercise) => {
            const edit = exerciseEdits[exercise.id] ?? exercise;
            return <button type="button" className={`exercise-admin-card ${edit.active ? "" : "archived"}`} key={exercise.id} onClick={() => setExerciseModalId(exercise.id)}>
              <b>{edit.name}</b><small>{edit.equipment} · {edit.type === "strength" ? "Kraft" : "Ausdauer"}</small>
            </button>;
          })}
          <button type="button" className="exercise-admin-card exercise-add-card" onClick={() => setShowExerciseCreateModal(true)}><Plus size={20} /><b>Übung hinzufügen</b></button>
        </div>
        {exerciseModalId && exerciseEdits[exerciseModalId] && (() => { const edit = exerciseEdits[exerciseModalId]; return <div className="modal-backdrop" onClick={() => setExerciseModalId(null)}><form className="admin-edit-modal exercise-details-modal" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void saveExercise(edit.id).then((saved) => { if (saved) setExerciseModalId(null); }); }}>
              <button type="button" className="modal-close" onClick={() => setExerciseModalId(null)} aria-label="Schließen"><X /></button><span className="setup-badge">Sportraum · Übung</span><h2>{edit.name}</h2>
                <div className="exercise-admin-editor">
                <label>Übungsname<input required minLength={2} maxLength={80} value={edit.name} onChange={(event) => setExerciseEdits((values) => ({ ...values, [edit.id]: { ...edit, name: event.target.value } }))} /></label>
                <label>Trainingsart<select value={edit.type} onChange={(event) => setExerciseEdits((values) => ({ ...values, [edit.id]: { ...edit, type: event.target.value as ExerciseMedia["type"] } }))}><option value="strength">Kraft</option><option value="endurance">Ausdauer</option></select></label>
                <label>Gerät<select required value={edit.equipment} onChange={(event) => setExerciseEdits((values) => ({ ...values, [edit.id]: { ...edit, equipment: event.target.value } }))}><option value={edit.equipment}>{edit.equipment}</option>{equipmentItems.filter((entry) => entry.active && entry.name !== edit.equipment).map((entry) => <option key={entry.id} value={entry.name}>{entry.name}</option>)}<option value="Ohne Gerät">Ohne Gerät</option><option value="Körpergewicht">Körpergewicht</option></select></label>
                <label className="wide-field">Bewegungsanleitung (ein Schritt pro Zeile)<textarea rows={3} maxLength={3000} value={edit.instructions} onChange={(event) => setExerciseEdits((values) => ({ ...values, [edit.id]: { ...edit, instructions: event.target.value } }))} placeholder="Ruhig starten …&#10;Bewegung kontrolliert ausführen …" /></label>
                <label className="wide-field">Sicherheitshinweise (ein Hinweis pro Zeile)<textarea rows={2} maxLength={1200} value={edit.safetyNotes} onChange={(event) => setExerciseEdits((values) => ({ ...values, [edit.id]: { ...edit, safetyNotes: event.target.value } }))} placeholder="Bei Schmerzen abbrechen …" /></label>
                <label className="wide-field">Video-Link<input type="url" inputMode="url" maxLength={500} placeholder="https://www.youtube.com/... (leer = Video entfernen)" value={edit.videoUrl ?? ""} onChange={(event) => setExerciseEdits((values) => ({ ...values, [edit.id]: { ...edit, videoUrl: event.target.value || null } }))} /></label>
                <div className="exercise-admin-actions"><button type="submit" disabled={savingExercise === edit.id}>{savingExercise === edit.id ? "Speichert …" : "Änderungen speichern"}</button>{edit.active ? <button type="button" className="archive-action" onClick={() => requestArchiveExercise(edit)}>Archivieren</button> : <button type="button" onClick={() => void saveExercise(edit.id, { active: true })}>Wiederherstellen</button>}</div>
                </div>
              </form></div>; })()}
        {showExerciseCreateModal && <div className="modal-backdrop" onClick={() => setShowExerciseCreateModal(false)}><form className="admin-edit-modal" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { void addExercise(event); }}>
          <button type="button" className="modal-close" onClick={() => setShowExerciseCreateModal(false)} aria-label="Schließen"><X /></button><span className="setup-badge">Sportraum · Neue Übung</span><h2>Übung anlegen</h2>
          <div className="exercise-create-grid">
            <label>Übungsname<input required minLength={2} maxLength={80} value={newExercise.name} onChange={(event) => setNewExercise((draft) => ({ ...draft, name: event.target.value }))} /></label>
            <label>Trainingsart<select value={newExercise.type} onChange={(event) => setNewExercise((draft) => ({ ...draft, type: event.target.value as ExerciseMedia["type"] }))}><option value="strength">Kraft</option><option value="endurance">Ausdauer</option></select></label>
            <label>Gerät<select required value={newExercise.equipment} onChange={(event) => setNewExercise((draft) => ({ ...draft, equipment: event.target.value }))}><option value="">Gerät auswählen</option>{equipmentItems.filter((entry) => entry.active && entry.available).map((entry) => <option key={entry.id} value={entry.name}>{entry.name}</option>)}<option value="Ohne Gerät">Ohne Gerät</option><option value="Körpergewicht">Körpergewicht</option></select></label>
            <label className="wide-field">Bewegungsanleitung (ein Schritt pro Zeile)<textarea required minLength={5} rows={3} maxLength={3000} value={newExercise.instructions} onChange={(event) => setNewExercise((draft) => ({ ...draft, instructions: event.target.value }))} /></label>
            <label className="wide-field">Sicherheitshinweise<textarea required minLength={5} rows={2} maxLength={1200} value={newExercise.safetyNotes} onChange={(event) => setNewExercise((draft) => ({ ...draft, safetyNotes: event.target.value }))} /></label>
            <label className="wide-field">Video-Link (optional)<input type="url" inputMode="url" maxLength={500} placeholder="https://www.youtube.com/..." value={newExercise.videoUrl} onChange={(event) => setNewExercise((draft) => ({ ...draft, videoUrl: event.target.value }))} /></label>
            <button type="submit"><Plus /> Übung anlegen</button>
          </div>
        </form></div>}
      </article>
      </>}
      {activeAdminSection === "familie" && <>
      <article className="wide"><div className="admin-title"><Users /><div><h2>Familienprofile</h2><p>E-Mail, Geburtsdatum, Fitnessstart und Avatar bearbeiten. Das Alter wird aus dem Geburtsdatum berechnet.</p></div></div><div className="equipment-table-wrap"><table className="equipment-table"><thead><tr><th>Name</th><th>E-Mail</th><th>Geburtsdatum</th><th>Alter</th><th>Avatar</th><th></th></tr></thead><tbody>{familyItems.map((profile) => { const age = profile.birthDate ? calculateAge(profile.birthDate) : null; return <tr key={profile.id}><td><b>{profile.name}</b></td><td>{profile.email || "Nicht hinterlegt"}</td><td>{profile.birthDate || "–"}</td><td>{age == null ? "–" : `${age} Jahre`}</td><td>Fitness-Stufe {profile.startingFitness}/5</td><td><button type="button" onClick={() => { setFamilyDraft({ ...profile }); setFamilyModalId(profile.id); }}>Bearbeiten</button></td></tr>; })}</tbody></table></div></article>
      <article className="wide"><div className="admin-title"><RotateCcw /><div><h2>Scores zurücksetzen</h2><p>Der vollständige Trainingsverlauf bleibt erhalten.</p></div></div><div className="reset-list">{familyItems.map((profile) => <div key={profile.id}><span>{profile.name}<small>{profileScores[profile.id] ?? 0} Punkte</small></span><button type="button" onClick={() => requestResetScore(profile.id)}>Auf 0 setzen</button></div>)}</div></article>
      </>}
    </section>
        </div>
      </div>

      {familyModalId && familyDraft && <div className="modal-backdrop" onClick={() => { setFamilyModalId(null); setFamilyDraft(null); }}><form className="admin-edit-modal family-edit-modal" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void saveFamilyProfile(); }}><button type="button" className="modal-close" onClick={() => { setFamilyModalId(null); setFamilyDraft(null); }} aria-label="Schließen"><X /></button><span className="setup-badge">Familie · Profil bearbeiten</span><h2>{familyDraft.name}</h2><div className="admin-edit-fields"><label>Name<input required maxLength={30} value={familyDraft.name} onChange={(event) => setFamilyDraft({ ...familyDraft, name: event.target.value })} /></label><label>E-Mail-Adresse<input type="email" maxLength={254} value={familyDraft.email ?? ""} onChange={(event) => setFamilyDraft({ ...familyDraft, email: event.target.value || null })} placeholder="name@example.com" /></label><label>Geburtsdatum<input type="date" value={familyDraft.birthDate ?? ""} onChange={(event) => setFamilyDraft({ ...familyDraft, birthDate: event.target.value || null })} /></label><label>Alter (automatisch)<input readOnly value={familyDraft.birthDate ? `${calculateAge(familyDraft.birthDate) ?? "Ungültiges Datum"} Jahre` : "Geburtsdatum eintragen"} /></label><label>Fitness zum Start<select value={familyDraft.startingFitness} onChange={(event) => setFamilyDraft({ ...familyDraft, startingFitness: Number(event.target.value) })}>{[1,2,3,4,5].map((value) => <option key={value} value={value}>{value} · {value === 1 ? "Neustart" : value === 5 ? "Sehr fit" : "Fitnessstufe"}</option>)}</select></label><label>Trainingsziel<select value={familyDraft.goal} onChange={(event) => setFamilyDraft({ ...familyDraft, goal: event.target.value })}>{GOALS.map((goal) => <option key={goal}>{goal}</option>)}</select></label><div className="wide-field"><span className="admin-field-label">Avatar auswählen</span><AvatarPicker value={avatarAssetForProfile(familyDraft.id, familyDraft.avatar) as AvatarId} onChange={(value) => setFamilyDraft({ ...familyDraft, avatar: value })} /></div></div><div className="exercise-admin-actions"><button type="button" className="confirm-cancel-btn" onClick={() => { setFamilyModalId(null); setFamilyDraft(null); }}>Abbrechen</button><button type="submit" disabled={savingFamily}>{savingFamily ? "Speichert …" : "Profil speichern"}</button></div></form></div>}

      {confirmModal && (
        <div className="modal-backdrop" onClick={() => { setConfirmModal(null); setConfirmPin(""); setConfirmPinError(""); }}>
          <div className="confirm-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button type="button" className="modal-close" onClick={() => { setConfirmModal(null); setConfirmPin(""); setConfirmPinError(""); }} aria-label="Schließen">×</button>
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
            {confirmModal.requiresPin && (
              <div className="confirm-pin-section">
                <b>Eltern-PIN erneut eingeben</b>
                <TouchPinpad
                  value={confirmPin}
                  disabled={verifyingConfirmPin}
                  onChange={(value) => { setConfirmPin(value); setConfirmPinError(""); }}
                />
                {confirmPinError && <p className="form-error">{confirmPinError}</p>}
              </div>
            )}
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="confirm-cancel-btn"
                onClick={() => { setConfirmModal(null); setConfirmPin(""); setConfirmPinError(""); }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className={`confirm-submit-btn ${confirmModal.confirmVariant ?? "primary"}`}
                disabled={verifyingConfirmPin || Boolean(confirmModal.requiresPin && confirmPin.length !== 4)}
                onClick={async () => {
                  if (confirmModal.requiresPin) {
                    setVerifyingConfirmPin(true);
                    setConfirmPinError("");
                    try {
                      const response = await fetch("/api/admin/verify", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ pin: confirmPin })
                      });
                      const result = await response.json();
                      if (!response.ok) {
                        setConfirmPinError(result.error ?? "Eltern-PIN ist nicht richtig.");
                        return;
                      }
                    } catch {
                      setConfirmPinError("PIN konnte nicht geprüft werden. Bitte Verbindung prüfen.");
                      return;
                    } finally {
                      setVerifyingConfirmPin(false);
                    }
                  }
                  const act = confirmModal.action;
                  setConfirmModal(null);
                  const freshPin = confirmModal.requiresPin ? confirmPin : undefined;
                  setConfirmPin("");
                  await act(freshPin);
                }}
              >
                {verifyingConfirmPin ? "PIN wird geprüft …" : confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
