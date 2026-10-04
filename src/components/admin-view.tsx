"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, AlertTriangle, Bot, CheckCircle2, ClipboardList, Database, FileText, HardDrive, Lock, Monitor, Moon, Plus, RotateCcw, ShieldCheck, Sparkles, Sun, Video, Wrench, X } from "lucide-react";
import { TouchPinpad } from "@/components/touch-pinpad";
import { AdminLogsPanel, summarizeAdminLog, type AdminLogEntry, type AdminLogFilter } from "@/components/admin-logs-panel";
import { AdminBackupPanel, type BackupStatus } from "@/components/admin-backup-panel";
import { AdminUpdatePanel, type UpdateInfo, type UpdateSuccess } from "@/components/admin-update-panel";
import { AdminHealthTrainingTest } from "@/components/admin-health-training-test";
import { AdminDataTransferPanel, type ImportValidation } from "@/components/admin-data-transfer-panel";
import { AdminSystemStatusPanel, type SystemStatus } from "@/components/admin-system-status-panel";
import { ManualPdfField, readManualPdf } from "@/components/manual-pdf-field";
import { MAX_DATA_IMPORT_BYTES } from "@/lib/data-transfer-schema";
import { showToast } from "@/components/toast";
import { applyTheme, cacheDisplaySettings, getStoredThemeSetting, subscribeTheme, type ThemeSetting } from "@/lib/theme";
import { TIME_ZONE_OPTIONS } from "@/lib/display-time";
import { DEFAULT_DISPLAY_SETTINGS, type DisplaySettings } from "@/lib/display-settings-shared";
import { formatGermanLogTimestamp } from "@/lib/date-format";
import { ApiRequestError, requestJson } from "@/lib/api-client";
import { EquipmentScanSettings } from "@/components/equipment-scan-settings";
import { matchesUpdate, parseUpdateJob, UPDATE_JOB_KEY, UPDATE_RESULT_KEY, UPDATE_TIMEOUT } from "@/lib/update-state";

type AiUsage = { requests: number; inputTokens: number; outputTokens: number; estimateUsd: number; updatedAt: string | null };
type Status = { openai: boolean; gemini: boolean; nas: boolean; models: { openai: string; gemini: string }; usage: { openai: AiUsage; gemini: AiUsage } };
type ExerciseMedia = { id: string; name: string; type: "strength" | "endurance"; equipment: string; instructions: string; safetyNotes: string; videoUrl: string | null; active: boolean };
type EquipmentItem = { id: string; name: string; quantity: number; available: boolean; active: boolean; videoUrl?: string | null; manualPdfUrl?: string | null; instructions?: string | null };
type ExerciseDraft = { name: string; type: "strength" | "endurance"; equipment: string; instructions: string; safetyNotes: string; videoUrl: string };
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

type AdminSection = "allgemein" | "ki" | "health" | "sicherung" | "daten" | "protokolle" | "sportraum";

const ADMIN_SECTIONS: { id: AdminSection; label: string; detail: string; icon: typeof Monitor }[] = [
  { id: "allgemein", label: "Allgemein", detail: "Design & Ruhemodus", icon: Monitor },
  { id: "ki", label: "KI-Integrationen", detail: "Schlüssel & Kosten", icon: Bot },
  { id: "health", label: "Apple Health / Gymondo", detail: "Trainingszeiten & Empfangstest", icon: CheckCircle2 },
  { id: "sicherung", label: "Datensicherung", detail: "NAS & Speicherorte", icon: HardDrive },
  { id: "daten", label: "System, Daten & Speicher", detail: "Updates, Export & Speicher", icon: Database },
  { id: "protokolle", label: "Protokolle", detail: "Fehler & Backup-Ereignisse", icon: ClipboardList },
  { id: "sportraum", label: "Sportraum", detail: "Geräte & Videos", icon: Wrench }
];

export function AdminView({
  exercises,
  equipment,
  initialVersion = "0.2.17",
  initialCommit
}: {
  exercises: ExerciseMedia[];
  equipment: EquipmentItem[];
  initialVersion?: string;
  initialCommit?: string;
}) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [authExpiresAt, setAuthExpiresAt] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);
  const verificationInFlight = useRef(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [activeAdminSection, setActiveAdminSection] = useState<AdminSection>("allgemein");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
  const [newEquipmentManualPdfUrl, setNewEquipmentManualPdfUrl] = useState("");
  const [newEquipmentManualFile, setNewEquipmentManualFile] = useState<File | null>(null);
  const [equipmentManualFiles, setEquipmentManualFiles] = useState<Record<string, File | null>>({});
  const [newEquipmentInstructions, setNewEquipmentInstructions] = useState("");
  const [showEquipmentCreateModal, setShowEquipmentCreateModal] = useState(false);
  const [equipmentModalId, setEquipmentModalId] = useState<string | null>(null);
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
  const [importValidation, setImportValidation] = useState<ImportValidation | null>(null);
  const [validatingImport, setValidatingImport] = useState(false);
  const [importingData, setImportingData] = useState(false);

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [runningUpdate, setRunningUpdate] = useState(false);
  const [updateCountdown] = useState<number | null>(null);
  const updatePollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const updateMonitorGeneration = useRef(0);
  const currentInstalledVersion = updateInfo?.version ?? initialVersion;
  const currentInstalledCommit = updateInfo?.currentCommit ?? initialCommit;

  useEffect(() => {
    const modalOpen = Boolean(confirmModal || exerciseModalId || showExerciseCreateModal || showEquipmentCreateModal || equipmentModalId);
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [confirmModal, exerciseModalId, showExerciseCreateModal, showEquipmentCreateModal, equipmentModalId]);

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

  async function checkUpdate() {
    setCheckingUpdate(true);
    try {
      const data = await requestJson<UpdateInfo>(
        "/api/admin/update",
        "Update-Prüfung fehlgeschlagen.",
        { cache: "no-store" }
      );
      setUpdateInfo(data);
    } catch (error) {
      const message = error instanceof ApiRequestError ? error.message : "Update-Server konnte nicht erreicht werden.";
      setNotice(message);
      showToast({ type: "error", title: "Update-Prüfung fehlgeschlagen", message });
    } finally {
      setCheckingUpdate(false);
    }
  }

  const [postUpdateSuccess, setPostUpdateSuccess] = useState<UpdateSuccess | null>(null);

  useEffect(() => () => {
    updateMonitorGeneration.current++;
    if (updatePollTimer.current) clearInterval(updatePollTimer.current);
  }, []);

  function monitorUpdate(jobId: string, startedAt = Date.now()) {
    if (updatePollTimer.current) clearInterval(updatePollTimer.current);
    const generation = ++updateMonitorGeneration.current;
    setRunningUpdate(true);
    try { sessionStorage.setItem(UPDATE_JOB_KEY, JSON.stringify({ jobId, startedAt })); } catch {}
    const stop = (forget = false) => {
      if (updatePollTimer.current) clearInterval(updatePollTimer.current);
      updatePollTimer.current = null;
      updateMonitorGeneration.current++;
      setRunningUpdate(false);
      if (forget) try { sessionStorage.removeItem(UPDATE_JOB_KEY); } catch {}
    };
    let polling = false;
    updatePollTimer.current = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const result = await requestJson<{
          state: "idle" | "unknown" | "running" | "success" | "error";
          message?: string; newCommit?: string; newVersion?: string;
        }>(`/api/admin/update?status=1&jobId=${encodeURIComponent(jobId)}`, "Update-Status nicht erreichbar.", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (generation !== updateMonitorGeneration.current) return;
        if (result.state === "error") {
          stop(true);
          setNotice(result.message || "Update fehlgeschlagen. Die vorherige Version wurde beibehalten.");
          showToast({ type: "error", title: "Update fehlgeschlagen", message: result.message || "Bitte das Betriebsprotokoll prüfen." });
        } else if (result.state === "success") {
          const target = { targetCommit: result.newCommit, targetVersion: result.newVersion };
          const current = await requestJson<{ version: string; commit: string; fullCommit: string }>("/api/version", "Laufende Version nicht erreichbar.", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
          if (generation !== updateMonitorGeneration.current) return;
          if (!matchesUpdate(current, target)) {
            stop();
            setNotice("Update nicht bestätigt: Die laufende Version stimmt nicht mit dem Update-Auftrag überein.");
            return;
          }
          try {
            sessionStorage.setItem(UPDATE_RESULT_KEY, JSON.stringify(target));
          } catch {}
          stop(true);
          window.location.reload();
        } else if (result.state === "unknown" || result.state === "idle") {
          setNotice(result.message || "Update-Status noch unklar.");
          if (Date.now() - startedAt > 60_000) stop();
        } else {
          setNotice(result.message || "Update wird vorbereitet und geprüft …");
        }
      } catch (error) {
        if (generation !== updateMonitorGeneration.current) return;
        if (error instanceof ApiRequestError && (error.status === 401 || error.status === 403)) {
          stop();
          setStatus(null);
          setAuthExpiresAt(null);
          setNotice("Bitte erneut entsperren, um den Update-Status zu prüfen.");
        } else {
          setNotice("Verbindung während des Updates unterbrochen. Status wird erneut geprüft …");
        }
      } finally {
        polling = false;
        if (generation === updateMonitorGeneration.current && Date.now() - startedAt > UPDATE_TIMEOUT && updatePollTimer.current) {
          stop();
          setNotice("Update-Status noch unklar. Bitte Betriebsprotokoll und installierte Version prüfen.");
        }
      }
    }, 3000);
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
      action: () => executeApplyUpdate()
    });
  }

  async function executeApplyUpdate() {
    setRunningUpdate(true);
    setNotice("Neue Version wird separat gebaut und geprüft. Die laufende App bleibt verfügbar.");
    try {
      const result = await requestJson<{ pending?: boolean; jobId?: string }>("/api/admin/update", "Update konnte nicht gestartet werden.", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
      });
      if (!result.pending || !result.jobId) throw new Error("Der Server hat keinen eindeutigen Update-Auftrag bestätigt.");
      monitorUpdate(result.jobId);
    } catch (error) {
      const message = error instanceof ApiRequestError ? error.message : error instanceof Error ? error.message : "Update-Start konnte nicht bestätigt werden.";
      setRunningUpdate(false);
      setNotice(message);
      showToast({ type: "error", title: "Update nicht bestätigt", message });
    }
  }

  useEffect(() => {
    // Remove legacy PIN storage. Authorization now lives in an HttpOnly cookie.
    try { localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY); } catch {}
    const restoreTimer = window.setTimeout(() => { void performUnlock(); }, 0);
    return () => window.clearTimeout(restoreTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authExpiresAt) return;
    const lock = () => {
      updateMonitorGeneration.current++;
      if (updatePollTimer.current) clearInterval(updatePollTimer.current);
      updatePollTimer.current = null;
      setRunningUpdate(false);
      setStatus(null);
      setPin("");
      setAuthExpiresAt(null);
      void fetch("/api/admin/verify", { method: "DELETE" }).catch(() => undefined);
    };
    const remaining = authExpiresAt - Date.now();
    if (remaining <= 0) {
      lock();
      return;
    }
    const timeout = window.setTimeout(lock, remaining);
    return () => window.clearTimeout(timeout);
  }, [authExpiresAt]);

  async function performUnlock(pinToTest?: string) {
    if (verificationInFlight.current || (pinToTest !== undefined && !/^\d{4}$/.test(pinToTest))) return;
    verificationInFlight.current = true;
    setVerifying(true);
    setError("");
    try {
      const result = await requestJson<{
        expiresAt: number;
        providers: Pick<Status, "openai" | "gemini">;
        usage: Status["usage"];
        models: Status["models"];
        nas: boolean;
        backup?: BackupStatus;
        displaySettings?: DisplaySettings;
      }>("/api/admin/verify", "Eltern-PIN ist falsch", {
        method: pinToTest ? "POST" : "GET",
        headers: { "Content-Type": "application/json" },
        body: pinToTest ? JSON.stringify({ pin: pinToTest }) : undefined,
        cache: "no-store"
      });
      setAuthExpiresAt(result.expiresAt);
      setPin("");
      try {
        const updateDoneRaw = sessionStorage.getItem(UPDATE_RESULT_KEY);
        if (updateDoneRaw) {
          sessionStorage.removeItem(UPDATE_RESULT_KEY);
          const meta = JSON.parse(updateDoneRaw);
          const current = await requestJson<{ version: string; commit: string; fullCommit: string }>("/api/version", "Versionsprüfung fehlgeschlagen.", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
          if (matchesUpdate(current, meta)) {
            setPostUpdateSuccess({ version: current.version, commit: current.commit });
            showToast({ type: "sparkles", title: "Update erfolgreich installiert!", message: `Version v${current.version} (Rev. ${current.commit}) wurde geprüft.` });
          } else setNotice("Update nicht bestätigt: Bitte installierte Version und Betriebsprotokoll prüfen.");
        }
      } catch {}
      try {
        const pending = parseUpdateJob(sessionStorage.getItem(UPDATE_JOB_KEY));
        if (pending) monitorUpdate(pending.jobId, pending.startedAt);
      } catch {}
      setStatus({ ...result.providers, usage: result.usage, models: result.models, nas: result.nas });
      if (result.backup) {
        setBackupStatus(result.backup);
        setNasPathInput(result.backup.path || "");
      }
      if (result.displaySettings) {
        setDisplaySettings(result.displaySettings);
        cacheDisplaySettings(result.displaySettings);
      }
      void checkUpdate();
    } catch (error) {
      if (pinToTest) setPin("");
      if (error instanceof ApiRequestError) {
        if (pinToTest || error.status !== 401) setError(error.message);
      } else {
        setError("Verbindungsfehler beim Prüfen der PIN");
      }
    } finally {
      verificationInFlight.current = false;
      setVerifying(false);
    }
  }

  async function saveDisplaySettings(changes: Partial<DisplaySettings>) {
    setSavingDisplay(true);
    try {
      const data = await requestJson<{ settings: DisplaySettings }>("/api/admin/display-settings", "Einstellungen konnten nicht gespeichert werden.", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, ...changes })
      });
      setDisplaySettings(data.settings);
      cacheDisplaySettings(data.settings);
      showToast({ type: "success", title: "Gespeichert", message: "Ruhemodus-Einstellungen wurden aktualisiert." });
    } catch (error) {
      showToast({ type: "error", title: "Fehler", message: error instanceof ApiRequestError ? error.message : "Einstellungen konnten nicht gespeichert werden." });
    } finally {
      setSavingDisplay(false);
    }
  }

  function enterPin(value: string) {
    if (verificationInFlight.current) return;
    const nextPin = value.replace(/\D/g, "").slice(0, 4);
    setPin(nextPin);
    setError("");
    if (nextPin.length === 4) void performUnlock(nextPin);
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
      const result = await requestJson<{
        message?: string;
        status?: Partial<Status>;
      }>("/api/admin/ai-settings", "API-Einstellung konnte nicht verarbeitet werden.", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, provider, action, apiKey: apiKeys[provider] || undefined })
      });
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
    } catch (error) {
      const msg = error instanceof ApiRequestError ? error.message : "Keine Verbindung zum Dashboard. Bitte Heimnetz prüfen und erneut versuchen.";
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
      const result = await requestJson<{ logs?: AdminLogEntry[] }>("/api/admin/logs", "Protokolle konnten nicht geladen werden.", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, filter })
      });
      setAdminLogs(Array.isArray(result.logs) ? result.logs : []);
    } catch (loadError) {
      showToast({ type: "error", title: "Protokolle nicht verfügbar", message: loadError instanceof Error ? loadError.message : "Keine Verbindung zum Dashboard." });
    } finally {
      setLoadingLogs(false);
    }
  }

  async function copyAdminLogs() {
    const text = adminLogs.map((entry) => {
      const timestamp = formatGermanLogTimestamp(entry.createdAt);
      const level = entry.details.level === "error" ? "FEHLER" : entry.details.level === "warning" ? "WARNUNG" : "INFO";
      const message = summarizeAdminLog(entry);
      return `[${timestamp}] ${level} · ${message}\n${entry.action}\n${JSON.stringify(entry.details, null, 2)}`;
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
      const result = await requestJson<SystemStatus>("/api/admin/system-status", "Speicherstatus konnte nicht geladen werden.", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      setSystemStatus(result);
    } catch (statusError) {
      showToast({ type: "error", title: "Speicherstatus nicht verfügbar", message: statusError instanceof Error ? statusError.message : "Keine Verbindung zum Dashboard." });
    } finally {
      setLoadingSystemStatus(false);
    }
  }

  async function validateImportFile() {
    if (!importFile) return;
    if (importFile.size > MAX_DATA_IMPORT_BYTES) {
      setImportValidation({ valid: false, total: 0, counts: {}, errors: ["Die Datei ist größer als 20 MiB. Bitte die vollständige Datensicherung verwenden."] });
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

  async function saveExercise(exerciseId: string, overrides: Partial<ExerciseMedia> = {}) {
    const exercise = { ...exerciseEdits[exerciseId], ...overrides };
    setSavingExercise(exerciseId); setNotice("");
    try {
      const result = await requestJson<{ exercise: ExerciseMedia }>(`/api/exercises/${encodeURIComponent(exerciseId)}`, "Übung konnte nicht gespeichert werden.", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, ...exercise, videoUrl: exercise.videoUrl?.trim() || null })
      });
      setExerciseItems((items) => items.map((item) => item.id === exerciseId ? result.exercise : item));
      setExerciseEdits((items) => ({ ...items, [exerciseId]: result.exercise }));
      setNotice("Übung und Anleitung gespeichert.");
      showToast({ type: "success", title: "Übung gespeichert", message: `${result.exercise.name} wurde aktualisiert.` });
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Keine Verbindung. Bitte Heimnetz prüfen und erneut versuchen.";
      setNotice(msg);
      showToast({ type: "error", title: "Fehler beim Speichern", message: msg });
      return false;
    } finally {
      setSavingExercise(null);
    }
  }

  async function addExercise(event: React.FormEvent) {
    event.preventDefault(); setNotice("");
    try {
      const result = await requestJson<{ exercise: ExerciseMedia }>("/api/exercises", "Übung konnte nicht angelegt werden.", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, ...newExercise, videoUrl: newExercise.videoUrl.trim() || null })
      });
      setExerciseItems((items) => [...items, result.exercise].sort((a, b) => a.name.localeCompare(b.name, "de")));
      setExerciseEdits((items) => ({ ...items, [result.exercise.id]: result.exercise }));
      setNewExercise({ name: "", type: "strength", equipment: "", instructions: "", safetyNotes: "", videoUrl: "" });
      setNotice("Übung wurde angelegt.");
      showToast({ type: "success", title: "Übung angelegt", message: `${result.exercise.name} ist jetzt verfügbar.` });
      setShowExerciseCreateModal(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Übung konnte nicht angelegt werden.";
      setNotice(message);
      showToast({ type: "error", title: "Übung nicht angelegt", message });
    }
  }

  function requestArchiveExercise(exercise: ExerciseMedia) {
    setConfirmModal({
      title: `„${exercise.name}“ archivieren?`,
      description: "Die Übung verschwindet aus der Auswahl und aus neuen Trainingsplänen. Gespeicherte Trainings und Videos bleiben erhalten; du kannst sie später wiederherstellen.",
      icon: "key", confirmLabel: "Übung archivieren", confirmVariant: "danger", requiresPin: true,
      action: async (freshPin) => {
        try {
          await requestJson(`/api/exercises/${encodeURIComponent(exercise.id)}`, "Übung konnte nicht archiviert werden.", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: freshPin }) });
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
    if (savingEquipment) return false;
    const item = { ...equipmentEdits[id], ...overrides };
    setSavingEquipment(id); setNotice("");
    try {
      const manualPdfUpload = await readManualPdf(equipmentManualFiles[id]);
      const result = await requestJson<{ equipment: EquipmentItem }>(`/api/equipment/${encodeURIComponent(id)}`, "Gerät konnte nicht gespeichert werden.", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, name: item.name, quantity: item.quantity, available: item.available, active: item.active, videoUrl: item.videoUrl?.trim() || null, manualPdfUrl: item.manualPdfUrl?.trim() || null, manualPdfUpload, instructions: item.instructions?.trim() || null })
      });
      setEquipmentItems((items) => items.map((entry) => entry.id === id ? result.equipment : entry));
      setEquipmentEdits((values) => ({ ...values, [id]: result.equipment }));
      setEquipmentManualFiles(values => ({ ...values, [id]: null }));
      setNotice("Gerätebestand gespeichert.");
      showToast({ type: "success", title: "Gerätebestand gespeichert", message: `${item.name} aktualisiert.` });
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Keine Verbindung. Bitte Heimnetz prüfen und erneut versuchen.";
      setNotice(msg);
      showToast({ type: "error", title: "Fehler", message: msg });
      return false;
    } finally {
      setSavingEquipment(null);
    }
  }

  async function addEquipment(event: React.FormEvent) {
    event.preventDefault();
    if (savingEquipment) return;
    setSavingEquipment("new"); setNotice("");
    try {
      const manualPdfUpload = await readManualPdf(newEquipmentManualFile);
      const result = await requestJson<{ equipment: EquipmentItem }>("/api/equipment", "Gerät konnte nicht ergänzt werden.", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, name: newEquipmentName, quantity: newEquipmentQuantity, videoUrl: newEquipmentVideoUrl.trim() || null, manualPdfUrl: newEquipmentManualPdfUrl.trim() || null, manualPdfUpload, instructions: newEquipmentInstructions.trim() || null })
      });
      setEquipmentItems((items) => [...items, result.equipment].sort((a, b) => a.name.localeCompare(b.name, "de")));
      setEquipmentEdits((values) => ({ ...values, [result.equipment.id]: result.equipment }));
      const addedName = newEquipmentName;
      setNewEquipmentManualFile(null);
      setNewEquipmentName(""); setNewEquipmentQuantity(1); setNewEquipmentVideoUrl(""); setNewEquipmentManualPdfUrl(""); setNewEquipmentInstructions(""); setNotice("Gerät wurde ergänzt.");
      setShowEquipmentCreateModal(false);
      showToast({ type: "success", title: "Gerät hinzugefügt", message: `${addedName} ist nun verfügbar.` });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Keine Verbindung. Bitte Heimnetz prüfen und erneut versuchen.";
      setNotice(msg);
      showToast({ type: "error", title: "Fehler", message: msg });
    } finally {
      setSavingEquipment(null);
    }
  }

  function requestArchiveEquipment(item: EquipmentItem) {
    setConfirmModal({
      title: `„${item.name}“ archivieren?`,
      description: "Das Gerät wird aus neuen Trainingsplänen und der Geräteauswahl entfernt. Verknüpfte aktive Übungen müssen vorher geändert oder archiviert werden. Die Trainingshistorie bleibt erhalten.",
      icon: "key", confirmLabel: "Gerät archivieren", confirmVariant: "danger", requiresPin: true,
      action: async (freshPin) => {
        try {
          await requestJson(`/api/equipment/${encodeURIComponent(item.id)}`, "Gerät konnte nicht archiviert werden.", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: freshPin }) });
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
        <form className="admin-login" onSubmit={event => event.preventDefault()}>
          <div className="pair-icon">
            <ShieldCheck />
          </div>
          <span className="setup-badge">Geschützter Bereich</span>
          <h1>Verwaltung</h1>
          <p>Einstellungen, Exporte und Updates sind mit dem Eltern-PIN geschützt.</p>

          <TouchPinpad
            value={pin}
            onChange={enterPin}
            disabled={verifying}
          />

          <label className="admin-pin-entry">
            Eltern-PIN · 4 Ziffern
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="current-password"
              aria-label="Eltern-PIN"
              placeholder="Tippen öffnet die Bildschirmtastatur"
              maxLength={4}
              disabled={verifying}
              value={pin}
              onChange={(event) => {
                enterPin(event.target.value);
              }}
            />
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}
          <p role="status">{verifying ? "PIN wird geprüft …" : "Prüfung automatisch nach der vierten Ziffer."}</p>
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
        <div><span>Elternbereich</span><h1>Verwaltung</h1><small className="admin-build-stamp">v{currentInstalledVersion} · Rev. {currentInstalledCommit ?? "unbekannt"}</small></div>
        <button
          type="button"
          className="admin-lock-btn"
          title="Verwaltungsbereich sperren"
          onClick={() => {
            updateMonitorGeneration.current++;
            if (updatePollTimer.current) clearInterval(updatePollTimer.current);
            updatePollTimer.current = null;
            setRunningUpdate(false);
            setStatus(null);
            setPin("");
            setAuthExpiresAt(null);
            void fetch("/api/admin/verify", { method: "DELETE" }).catch(() => undefined);
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
              { label: "Auto (Tag/Nacht)", val: "system" as const, icon: <Monitor size={14} /> },
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

        <label className="display-time-zone">Zeitzone
          <select value={displaySettings.timeZone} disabled={savingDisplay} onChange={event => void saveDisplaySettings({ timeZone: event.target.value })}>
            {Array.from(new Set([displaySettings.timeZone, ...TIME_ZONE_OPTIONS])).map(zone => <option key={zone} value={zone}>{zone === "Europe/Berlin" ? "Berlin · Deutschland (Standard)" : zone}</option>)}
          </select>
          <small>Auto: tagsüber hell, im Nachtruhe-Zeitfenster dunkel. Sommer-/Winterzeit wird automatisch berücksichtigt.</small>
        </label>
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
              { label: "60 Min.", val: 60 },
              { label: "90 Min.", val: 90 },
              { label: "180 Min.", val: 180 },
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

        <div className="screensaver-night-settings" style={{ marginTop: "14px" }}>
          <label>Vorbereitungszeit vor jeder KI-Plan-Übung
            <select value={displaySettings.preparationSeconds ?? 30} disabled={savingDisplay} onChange={event => void saveDisplaySettings({ preparationSeconds: Number(event.target.value) })}>
              {[5, 10, 20, 30, 60].map(seconds => <option key={seconds} value={seconds}>{seconds} Sekunden</option>)}
            </select>
          </label>
          <p>Vorbereitung und Übungswechsel zählen nicht als Trainingszeit. Die nächste Übung muss bewusst gestartet werden.</p>
          <label className="night-mode-toggle-wrap">
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
      {activeAdminSection === "sicherung" && <AdminBackupPanel
        status={backupStatus}
        path={nasPathInput}
        encryptionKey={nasKeyInput}
        server={nasServerInput}
        share={nasShareInput}
        username={nasUserInput}
        password={nasPassInput}
        showMountForm={showNasMountForm}
        showAdvanced={showAdvancedNas}
        saving={savingNas}
        testing={testingNas}
        backingUp={runningBackup}
        mounting={mountingNas}
        onPathChange={setNasPathInput}
        onKeyChange={setNasKeyInput}
        onServerChange={setNasServerInput}
        onShareChange={setNasShareInput}
        onUsernameChange={setNasUserInput}
        onPasswordChange={setNasPassInput}
        onToggleMountForm={() => setShowNasMountForm((previous) => !previous)}
        onToggleAdvanced={() => setShowAdvancedNas((previous) => !previous)}
        onSavePath={() => void saveNasBackupPath()}
        onTestConnection={() => void testNasBackupConnection()}
        onStartBackup={requestNasBackup}
        onMountShare={() => void mountNasShare()}
      />}
      {activeAdminSection === "health" && <AdminHealthTrainingTest />}
      {activeAdminSection === "daten" && <>
        <AdminUpdatePanel
          info={updateInfo}
          installedVersion={currentInstalledVersion}
          installedCommit={currentInstalledCommit}
          success={postUpdateSuccess}
          checking={checkingUpdate}
          running={runningUpdate}
          countdown={updateCountdown}
          onDismissSuccess={() => setPostUpdateSuccess(null)}
          onCheck={() => void checkUpdate()}
          onInstall={requestApplyUpdate}
        />
        <AdminSystemStatusPanel status={systemStatus} loading={loadingSystemStatus} onRefresh={() => void refreshSystemStatus()} />

        <AdminDataTransferPanel
          file={importFile}
          validation={importValidation}
          canImport={Boolean(importPayload)}
          validating={validatingImport}
          importing={importingData}
          onFileChange={(file) => { setImportFile(file); setImportPayload(null); setImportValidation(null); }}
          onDownload={() => void download()}
          onValidate={() => void validateImportFile()}
          onImport={requestDataImport}
        />
      </>}
      {activeAdminSection === "protokolle" && <AdminLogsPanel
        entries={adminLogs}
        filter={logFilter}
        loading={loadingLogs}
        copying={copyingLogs}
        onFilterChange={(filter) => { setLogFilter(filter); void loadAdminLogs(filter); }}
        onRefresh={() => void loadAdminLogs()}
        onCopy={() => void copyAdminLogs()}
      />}
      {activeAdminSection === "sportraum" && <>
      <EquipmentScanSettings equipment={equipmentItems} pin={pin} />
      <article className="wide"><div className="sportraum-header"><div className="admin-title"><Database /><div><h2>Geräte im Sportraum</h2><p>Geräte, Verfügbarkeit und gerätebezogene Videos verwalten. Archivierte Einträge bleiben für die Historie erhalten.</p></div></div><button type="button" className="equipment-add-open" onClick={() => setShowEquipmentCreateModal(true)}><Plus size={17} /> Gerät hinzufügen</button></div>
        <div className="equipment-card-grid" aria-label="Geräte im Sportraum">
          {equipmentItems.map((item) => {
            const hasManual = Boolean(item.manualPdfUrl?.trim());
            const hasSafety = Boolean(item.instructions?.trim());
            const hasVideo = Boolean(item.videoUrl?.trim());
            const statusLabel = `Anleitung ${hasManual ? "vorhanden" : "fehlt"}; Sicherheitshinweise ${hasSafety ? "vorhanden" : "fehlen"}; Video ${hasVideo ? "vorhanden" : "fehlt"}`;
            return <button type="button" key={item.id} className={`equipment-card ${item.active ? "" : "archived"}`} onClick={() => { setEquipmentEdits((values) => ({ ...values, [item.id]: { ...item } })); setEquipmentManualFiles(values => ({ ...values, [item.id]: null })); setEquipmentModalId(item.id); }}><span>{item.name}</span><small>{item.quantity} Stück</small><span className="equipment-card-icons" aria-label={statusLabel} title={statusLabel}><FileText aria-label={`Anleitung ${hasManual ? "vorhanden" : "fehlt"}`} className={`equipment-card-icon ${hasManual ? "is-present" : "is-missing"}`} /><ShieldCheck aria-label={`Sicherheitshinweise ${hasSafety ? "vorhanden" : "fehlen"}`} className={`equipment-card-icon ${hasSafety ? "is-present" : "is-missing"}`} /><Video aria-label={`Video ${hasVideo ? "vorhanden" : "fehlt"}`} className={`equipment-card-icon ${hasVideo ? "is-present" : "is-missing"}`} /></span></button>;
          })}
        </div>
      </article>
      {showEquipmentCreateModal && <div className="modal-backdrop" onClick={() => { if (!savingEquipment) setShowEquipmentCreateModal(false); }}><form className="admin-edit-modal equipment-create-modal" onClick={(event) => event.stopPropagation()} onSubmit={addEquipment}><button type="button" className="modal-close" onClick={() => { if (!savingEquipment) setShowEquipmentCreateModal(false); }} aria-label="Schließen"><X /></button><span className="setup-badge">Sportraum · Neues Gerät</span><h2>Gerät hinzufügen</h2><fieldset className="admin-edit-fields" disabled={Boolean(savingEquipment)}><label>Gerätename<input autoFocus required minLength={2} maxLength={60} placeholder="z. B. Hantelbank" value={newEquipmentName} onChange={(event) => setNewEquipmentName(event.target.value)} /></label><label>Anzahl<input type="number" min={1} max={8} value={newEquipmentQuantity} onChange={(event) => setNewEquipmentQuantity(Number(event.target.value))} /></label><ManualPdfField url={newEquipmentManualPdfUrl} file={newEquipmentManualFile} disabled={Boolean(savingEquipment)} onUrlChange={setNewEquipmentManualPdfUrl} onFileChange={setNewEquipmentManualFile} /><label className="wide-field">Zusätzliche Sicherheitshinweise<textarea rows={4} maxLength={3000} value={newEquipmentInstructions} onChange={(event) => setNewEquipmentInstructions(event.target.value)} placeholder="Hinweise zur sicheren Nutzung …" /></label><label className="wide-field">Gerätevideo (optional)<input type="url" inputMode="url" maxLength={500} placeholder="Optionaler YouTube-Link zum Gerät" value={newEquipmentVideoUrl} onChange={(event) => setNewEquipmentVideoUrl(event.target.value)} /></label></fieldset><div className="exercise-admin-actions"><button type="button" className="confirm-cancel-btn" onClick={() => { if (!savingEquipment) setShowEquipmentCreateModal(false); }}>Abbrechen</button><button type="submit" disabled={Boolean(savingEquipment)}><Plus size={16} /> {savingEquipment ? "Speichert …" : "Gerät ergänzen"}</button></div></form></div>}
      {equipmentModalId && equipmentEdits[equipmentModalId] && (() => { const edit = equipmentEdits[equipmentModalId]; return <div className="modal-backdrop" onClick={() => { if (!savingEquipment) setEquipmentModalId(null); }}><form className="admin-edit-modal" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void saveEquipment(edit.id).then((saved) => { if (saved) setEquipmentModalId(null); }); }}><button type="button" className="modal-close" onClick={() => { if (!savingEquipment) setEquipmentModalId(null); }} aria-label="Schließen"><X /></button><span className="setup-badge">Sportraum · Gerät</span><h2>{edit.name}</h2><fieldset className="admin-edit-fields" disabled={Boolean(savingEquipment)}><label>Gerätename<input required minLength={2} maxLength={60} value={edit.name} onChange={(event) => setEquipmentEdits((values) => ({ ...values, [edit.id]: { ...edit, name: event.target.value } }))} /></label><label>Anzahl<input type="number" min={1} max={8} value={edit.quantity} onChange={(event) => setEquipmentEdits((values) => ({ ...values, [edit.id]: { ...edit, quantity: Number(event.target.value) } }))} /></label><ManualPdfField url={edit.manualPdfUrl ?? ""} file={equipmentManualFiles[edit.id]} disabled={Boolean(savingEquipment)} onUrlChange={url => setEquipmentEdits(values => ({ ...values, [edit.id]: { ...edit, manualPdfUrl: url || null } }))} onFileChange={file => setEquipmentManualFiles(values => ({ ...values, [edit.id]: file }))} /><label className="wide-field">Zusätzliche Sicherheitshinweise<textarea rows={5} maxLength={3000} value={edit.instructions ?? ""} onChange={(event) => setEquipmentEdits((values) => ({ ...values, [edit.id]: { ...edit, instructions: event.target.value } }))} placeholder="Hinweise zur sicheren Nutzung …" /></label><label className="wide-field">Gerätevideo (optional)<input type="url" inputMode="url" maxLength={500} placeholder="https://www.youtube.com/watch?v=…" value={edit.videoUrl ?? ""} onChange={(event) => setEquipmentEdits((values) => ({ ...values, [edit.id]: { ...edit, videoUrl: event.target.value || null } }))} /></label><label className="inventory-toggle"><input type="checkbox" checked={edit.available} onChange={(event) => setEquipmentEdits((values) => ({ ...values, [edit.id]: { ...edit, available: event.target.checked } }))} /> Verfügbar</label></fieldset><div className="exercise-admin-actions"><button type="submit" disabled={savingEquipment === edit.id}>{savingEquipment === edit.id ? "Speichert …" : "Änderungen speichern"}</button>{edit.active ? <button type="button" className="archive-action" disabled={Boolean(savingEquipment)} onClick={() => requestArchiveEquipment(edit)}>Archivieren</button> : <button type="button" onClick={() => void saveEquipment(edit.id, { active: true })}>Wiederherstellen</button>}</div></form></div>; })()}
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
    </section>
        </div>
      </div>

      {confirmModal && (
        <div className="modal-backdrop" onClick={() => { setConfirmModal(null); setConfirmPin(""); setConfirmPinError(""); }}>
          <div className={`confirm-modal-card${confirmModal.icon === "update" ? " confirm-modal-update" : ""}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
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
                      await requestJson("/api/admin/verify", "Eltern-PIN ist nicht richtig.", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ pin: confirmPin })
                      });
                    } catch (error) {
                      setConfirmPinError(error instanceof Error ? error.message : "PIN konnte nicht geprüft werden. Bitte Verbindung prüfen.");
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
