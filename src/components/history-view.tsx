"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, ArrowLeftRight, Dumbbell, Pencil, PencilLine, Plus, Trash2 } from "lucide-react";
import type { DashboardProfile } from "@/lib/domain";
import { TouchPinpad } from "@/components/touch-pinpad";
import { showToast } from "@/components/toast";
import { formatGermanDate, formatGermanTime, formatGermanWeekday } from "@/lib/date-format";
import { KioskIdleBar } from "@/components/kiosk-idle-bar";
import { requestJson } from "@/lib/api-client";
import { EquipmentStats } from "@/components/equipment-stats";
import type { EquipmentStats as DeviceStats } from "@/lib/equipment-stats";

type Segment = { id: string; type: "strength" | "endurance"; exerciseName: string | null; equipmentName?: string | null; startedAt: string; endedAt: string | null; durationSeconds?: number };
type Session = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  source: string;
  recordingMode?: "app" | "health";
  edited: boolean;
  segments: Segment[];
};

function elapsedMinutes(start: string, end: string | null, seconds?: number) {
  if (seconds !== undefined) return seconds / 60;
  return Math.max(0, (new Date(end ?? Date.now()).getTime() - new Date(start).getTime()) / 60000);
}
function displayedMinutes(seconds: number) { return Math.round(seconds / 60 * 100) / 100; }

function SwipeableSessionRow({
  session,
  onEdit,
  onDelete
}: {
  session: Session;
  onEdit: (session: Session) => void;
  onDelete: (session: Session) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startRef = useRef<{ x: number; y: number; isHorizontal: boolean | null }>({ x: 0, y: 0, isHorizontal: null });

  function handleStart(clientX: number, clientY: number) {
    if (session.status === "active") return;
    startRef.current = { x: clientX, y: clientY, isHorizontal: null };
    setSwiping(true);
  }

  function handleMove(clientX: number, clientY: number, e?: React.TouchEvent | React.PointerEvent) {
    if (!swiping) return;
    const dx = clientX - startRef.current.x;
    const dy = clientY - startRef.current.y;

    if (startRef.current.isHorizontal === null) {
      if (Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy)) {
        startRef.current.isHorizontal = true;
      } else if (Math.abs(dy) > 7) {
        startRef.current.isHorizontal = false;
      }
    }

    if (startRef.current.isHorizontal) {
      if (e && e.cancelable && "preventDefault" in e) {
        e.preventDefault();
      }
      let currentOffset = dx;
      if (Math.abs(currentOffset) > 100) {
        const extra = Math.abs(currentOffset) - 100;
        currentOffset = Math.sign(currentOffset) * (100 + extra * 0.25);
      }
      setOffset(currentOffset);
    }
  }

  function handleEnd() {
    if (!swiping) return;
    setSwiping(false);
    if (startRef.current.isHorizontal) {
      if (offset < -70) {
        onDelete(session);
      } else if (offset > 70) {
        onEdit(session);
      }
    }
    setOffset(0);
    startRef.current = { x: 0, y: 0, isHorizontal: null };
  }

  return (
    <div className="swipeable-session-wrapper">
      <div className="swipe-action-backdrop">
        <button
          type="button"
          className="swipe-action-left"
          disabled={session.status === "active"}
          onClick={() => onEdit(session)}
          aria-label="Einheit bearbeiten"
          style={{
            opacity: offset > 15 ? Math.min(1, offset / 60) : 0,
            transform: `scale(${offset > 15 ? 1 : 0.85})`
          }}
        >
          <Pencil size={20} />
          <span>Bearbeiten</span>
        </button>
        <button
          type="button"
          className="swipe-action-right"
          disabled={session.status === "active"}
          onClick={() => onDelete(session)}
          aria-label="Einheit löschen"
          style={{
            opacity: offset < -15 ? Math.min(1, Math.abs(offset) / 60) : 0,
            transform: `scale(${offset < -15 ? 1 : 0.85})`
          }}
        >
          <span>Löschen</span>
          <Trash2 size={20} />
        </button>
      </div>

      <article
        className="swipeable-session-card"
        style={{
          transform: `translateX(${offset}px)`,
          transition: swiping ? "none" : "transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)"
        }}
        onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY, e)}
        onTouchEnd={handleEnd}
        onTouchCancel={handleEnd}
        onPointerDown={(e) => {
          if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
          handleStart(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => handleMove(e.clientX, e.clientY, e)}
        onPointerUp={handleEnd}
        onPointerCancel={handleEnd}
      >
        <div className="session-date">
          <strong>{formatGermanDate(session.startedAt)}</strong>
          <span>{formatGermanWeekday(session.startedAt)}</span>
        </div>
        <div className="segment-list">
          {session.segments.map((segment) => (
            <div key={segment.id}>
              {segment.type === "strength" ? <Dumbbell /> : <Activity />}
              <span>
                <b>{segment.exerciseName ?? (segment.type === "strength" ? "Krafttraining" : "Ausdauertraining")}</b>
                <small>
                  {segment.equipmentName && `${segment.equipmentName} · `}{formatGermanTime(segment.startedAt)} ·{" "}
                  {elapsedMinutes(segment.startedAt, segment.endedAt, session.recordingMode === "health" ? undefined : segment.durationSeconds).toLocaleString("de-DE", { maximumFractionDigits: 2 })} Minuten{session.recordingMode === "health" ? " · ohne Wertung" : ""}
                </small>
              </span>
            </div>
          ))}
        </div>
        <div className="session-card-right">
          {session.source === "health_import" && <span>Apple Health · 1,5 Punkte/Minute · importierte aktive Zeit</span>}
          {session.recordingMode === "health" && <span>App-Timer ohne Wertung · nur Health-Import zählt</span>}
          {(session.edited || session.source === "manual") && (
            <em>
              <PencilLine size={13} /> Manuell
            </em>
          )}
          {session.status === "active" && <em className="session-running-tag">Läuft</em>}
          {session.status === "active" && <small>Zum Bearbeiten oder Löschen zuerst stoppen.</small>}
          <div className="session-desktop-actions">
            <button
              type="button"
              className="session-action-icon edit-icon"
              disabled={session.status === "active"}
              title="Trainingseinheit bearbeiten"
              aria-label="Trainingseinheit bearbeiten"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(session);
              }}
            >
              <Pencil size={18} />
            </button>
            <button
              type="button"
              className="session-action-icon delete-icon"
              disabled={session.status === "active"}
              title="Trainingseinheit löschen"
              aria-label="Trainingseinheit löschen"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(session);
              }}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}

export function HistoryView({ profile }: { profile: DashboardProfile }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [equipmentStats, setEquipmentStats] = useState<DeviceStats[]>([]);
  const [loadError, setLoadError] = useState("");
  const [score, setScore] = useState(profile.score);
  const [saving, setSaving] = useState(false);
  const [editMinutes, setEditMinutes] = useState("");

  // Manual Add Modal state
  const [manual, setManual] = useState(false);
  const [manualPin, setManualPin] = useState("");
  const [manualError, setManualError] = useState("");

  // Edit Modal state
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editType, setEditType] = useState<"strength" | "endurance">("strength");
  const [editPin, setEditPin] = useState("");
  const [editError, setEditError] = useState("");

  // Delete Modal state
  const [deletingSession, setDeletingSession] = useState<Session | null>(null);
  const [deletePin, setDeletePin] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [busyDelete, setBusyDelete] = useState(false);

  const load = async () => {
    const [data, dashboard] = await Promise.all([requestJson<{ sessions?: Session[]; equipmentStats?: DeviceStats[] }>(
    `/api/history/${encodeURIComponent(profile.id)}`, "Trainingsverlauf konnte nicht geladen werden."
    ), requestJson<{ profiles: DashboardProfile[] }>("/api/dashboard", "Wertung konnte nicht aktualisiert werden.")]);
    setSessions(data.sessions ?? []); setEquipmentStats(data.equipmentStats ?? []); setLoadError("");
    const updated = dashboard.profiles.find(item => item.id === profile.id);
    if (updated) setScore(updated.score);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => { void load().catch(error => setLoadError(error instanceof Error ? error.message : "Verlauf nicht erreichbar.")); }, 0);
    return () => clearTimeout(timer);
  }, [profile.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(
    () =>
      Math.floor(sessions.reduce(
        (sum, session) =>
          sum + session.segments.reduce((segmentSum, segment) => segmentSum + elapsedMinutes(segment.startedAt, segment.endedAt, segment.durationSeconds), 0),
        0
      )),
    [sessions]
  );

  function startEdit(session: Session) {
    if (session.status === "active") return;
    const startDate = new Date(session.startedAt);
    const endDate = new Date(session.endedAt || Date.now());
    const dateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(
      startDate.getDate()
    ).padStart(2, "0")}`;
    const time = (date: Date) => `${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}:${String(date.getSeconds()).padStart(2,"0")}`;
    const startStr = time(startDate), endStr = time(endDate);

    setEditingSession(session);
    setEditDate(dateStr);
    setEditEndDate(`${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`);
    setEditStart(startStr);
    setEditEnd(endStr);
    setEditType(session.segments[0]?.type === "endurance" ? "endurance" : "strength");
    setEditMinutes(String(displayedMinutes(session.segments[0]?.durationSeconds ?? 0)));
    setEditPin("");
    setEditError("");
  }

  function startDelete(session: Session) {
    if (session.status === "active") return;
    setDeletingSession(session);
    setDeletePin("");
    setDeleteError("");
  }

  async function addManual(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualError("");
    const data = new FormData(event.currentTarget);
    const date = String(data.get("date"));
    const start = String(data.get("start"));
    const end = String(data.get("end"));
    const pin = String(data.get("pin"));

    try {
      await requestJson("/api/manual-training", "Eintrag konnte nicht gespeichert werden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          profileId: profile.id,
          type: data.get("type"),
          startedAt: new Date(`${date}T${start}`).toISOString(),
          endedAt: new Date(`${date}T${end}`).toISOString(),
          exerciseId: null
        })
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Eintrag konnte nicht gespeichert werden";
      setManualError(msg);
      showToast({ type: "error", title: "Fehler beim Nachtragen", message: msg });
      return;
    }
    setManual(false);
    setManualPin("");
    await load().catch(error => setLoadError(error instanceof Error ? error.message : "Verlauf bitte neu laden."));
    showToast({
      type: "success",
      title: "Training nachgetragen",
      message: "Einheit wurde erfolgreich im Verlauf gespeichert."
    });
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingSession) return;
    setEditError("");
    setSaving(true);
    try {
      const startedAt = new Date(`${editDate}T${editStart}`).toISOString();
      const endedAt = new Date(`${editEndDate}T${editEnd}`).toISOString();
      const storedSeconds = editingSession.segments[0]?.durationSeconds ?? 0;
      const activeSeconds = Number(editMinutes) === displayedMinutes(storedSeconds) ? storedSeconds : Math.round(Number(editMinutes) * 60 * 1e6) / 1e6;
      await requestJson("/api/manual-training", "Änderungen konnten nicht gespeichert werden", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: editPin, sessionId: editingSession.id, profileId: profile.id, type: editType, startedAt, endedAt, ...(editingSession.source === "health_import" ? { durationSeconds: activeSeconds } : {}) })
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Änderungen konnten nicht gespeichert werden";
      setEditError(msg);
      showToast({ type: "error", title: "Fehler beim Bearbeiten", message: msg });
      return;
    } finally { setSaving(false); }
    setEditingSession(null);
    setEditPin("");
    await load().catch(error => setLoadError(error instanceof Error ? error.message : "Verlauf bitte neu laden."));
    showToast({
      type: "success",
      title: "Einheit bearbeitet",
      message: "Punkte, Trainingsminuten und Level werden aus den korrigierten Daten neu berechnet."
    });
  }

  async function executeDelete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deletingSession) return;
    setBusyDelete(true);
    setDeleteError("");

    try {
      await requestJson("/api/manual-training", "Eintrag konnte nicht gelöscht werden", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin: deletePin,
          sessionId: deletingSession.id,
          profileId: profile.id
        })
      });
      setDeletingSession(null);
      setDeletePin("");
      await load().catch(error => setLoadError(error instanceof Error ? error.message : "Verlauf bitte neu laden."));
      showToast({
        type: "success",
        title: "Einheit gelöscht",
        message: "Das Training wurde dauerhaft aus dem Verlauf entfernt."
      });
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Verbindungsfehler beim Löschen");
    } finally {
      setBusyDelete(false);
    }
  }

  return (
    <main className="subpage" style={{ "--profile": profile.color } as React.CSSProperties}>
      <KioskIdleBar paused={manual || Boolean(editingSession) || Boolean(deletingSession)} redirectUrl="/" seconds={60} color={profile.color} title={`Trainingsverlauf von ${profile.name}`} />
      <header>
        <Link href={`/profil/${profile.id}`} title={`Zurück zur Profilseite von ${profile.name}`}>
          <ArrowLeft /> Zurück
        </Link>
        <div>
          <span>Gesamtverlauf</span>
          <h1>{profile.name}</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            setManual(true);
            setManualPin("");
            setManualError("");
          }}
          title="Vergangenes Training manuell mit Datum & Dauer nachtragen"
        >
          <Plus /> Nachtragen
        </button>
      </header>

      <section className="history-stats">
        <div>
          <strong>{score}</strong>
          <span>Punkte gesamt</span>
        </div>
        <div>
          <strong>{totals}</strong>
          <span>Trainingsminuten</span>
        </div>
        <div>
          <strong>{sessions.length}</strong>
          <span>Einheiten</span>
        </div>
      </section>

      {loadError && <div role="alert" className="form-error">{loadError}<button type="button" onClick={() => void load().catch(error => setLoadError(error instanceof Error ? error.message : "Verlauf nicht erreichbar."))}>Erneut laden</button></div>}

      {sessions.length > 0 && (
        <div className="swipe-hint">
          <ArrowLeftRight size={14} />
          <span>Stift zum Bearbeiten · Papierkorb zum Löschen · alternativ wischen.</span>
        </div>
      )}

      <section className="session-list">
        {sessions.length === 0 ? (
          <div className="empty-state">
            <Activity />
            <h2>Noch kein Training</h2>
            <p>Deine erste Einheit erscheint automatisch hier.</p>
          </div>
        ) : (
          sessions.map((session) => (
            <SwipeableSessionRow
              key={session.id}
              session={session}
              onEdit={startEdit}
              onDelete={startDelete}
            />
          ))
        )}
      </section>

      {equipmentStats.length > 0 && <EquipmentStats items={equipmentStats} />}

      {/* Manual Add Modal */}
      {manual && (
        <div className="modal-backdrop">
          <form className="manual-modal" onSubmit={addManual}>
            <button
              type="button"
              className="modal-close"
              onClick={() => {
                setManual(false);
                setManualPin("");
              }}
            >
              ×
            </button>
            <span className="setup-badge">Nachtragen</span>
            <h2>Training hinzufügen</h2>
            <label>
              Datum
              <input
                name="date"
                type="date"
                required
                defaultValue={new Date().toISOString().split("T")[0]}
              />
            </label>
            <div className="two-fields">
              <label>
                Start
                <input name="start" type="time" required />
              </label>
              <label>
                Ende
                <input name="end" type="time" required />
              </label>
            </div>
            <label>
              Training
              <select name="type">
                <option value="strength">Kraft</option>
                <option value="endurance">Ausdauer</option>
              </select>
            </label>
            <label>Eltern-PIN (4 Ziffern)</label>
            <TouchPinpad value={manualPin} onChange={setManualPin} />
            <input type="hidden" name="pin" value={manualPin} />
            {manualError && <p className="form-error">{manualError}</p>}
            <button className="primary-submit" disabled={manualPin.length !== 4}>
              Speichern
            </button>
          </form>
        </div>
      )}

      {/* Edit Modal */}
      {editingSession && (
        <div className="modal-backdrop">
          <form className="manual-modal" onSubmit={saveEdit}>
            <button
              type="button"
              className="modal-close"
              onClick={() => {
                setEditingSession(null);
                setEditPin("");
              }}
            >
              ×
            </button>
            <span className="setup-badge">Bearbeiten</span>
            <h2>Training anpassen</h2>
            {editingSession.recordingMode === "health" && <p>App-Timer ohne Wertung: Auch nach der Korrektur gibt dieser Eintrag keine Punkte oder Levelminuten. Nur ein späterer Health-Import zählt.</p>}
            {editingSession.source === "health_import" && <><p>Apple-Health-Import · 1,5 Punkte pro aktiver Minute. Die Korrektur bleibt auch bei erneutem Import erhalten.</p><label>Aktive Trainingsminuten<input type="number" required min="0.01" max="240" step="any" value={editMinutes} onChange={event => setEditMinutes(event.target.value)} /></label><small>Gespeichert: {editingSession.segments[0]?.durationSeconds} Sekunden. Die gerundete Anzeige verändert beim unveränderten Speichern nicht die Zeit.</small></>}
            <label>
              Startdatum
              <input
                type="date"
                required
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
              />
            </label>
            <label>
              Enddatum
              <input
                type="date"
                required
                value={editEndDate}
                onChange={(e) => setEditEndDate(e.target.value)}
              />
            </label>
            <div className="two-fields">
              <label>
                Start
                <input
                  type="time"
                  required
                  step="1"
                  value={editStart}
                  onChange={(e) => setEditStart(e.target.value)}
                />
              </label>
              <label>
                Ende
                <input
                  type="time"
                  required
                  step="1"
                  value={editEnd}
                  onChange={(e) => setEditEnd(e.target.value)}
                />
              </label>
            </div>
            {editingSession.segments.length === 1 ? (
              <label>
                Training
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value as "strength" | "endurance")}
                >
                  <option value="strength">Kraft</option>
                  <option value="endurance">Ausdauer</option>
                </select>
              </label>
            ) : (
              <p className="field-hint">Die Übungsarten dieser Einheit bleiben erhalten. Zeitangaben werden auf alle Teilübungen übertragen.</p>
            )}
            <label>Eltern-PIN zur Freigabe (4 Ziffern)</label>
            <TouchPinpad value={editPin} onChange={setEditPin} />
            {editError && <p className="form-error">{editError}</p>}
            <button className="primary-submit" disabled={editPin.length !== 4 || saving}>
              {saving ? "Speichert …" : "Änderungen speichern"}
            </button>
          </form>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingSession && (
        <div className="modal-backdrop">
          <form className="manual-modal" onSubmit={executeDelete}>
            <button
              type="button"
              className="modal-close"
              onClick={() => {
                setDeletingSession(null);
                setDeletePin("");
              }}
            >
              ×
            </button>
            <span className="setup-badge" style={{ background: "rgba(239, 68, 68, 0.2)", color: "#ef4444" }}>
              Löschen
            </span>
            <h2>Trainingseinheit entfernen?</h2>

            <div className="confirm-delete-box">
              <p>
                <b>
                  {formatGermanDate(deletingSession.startedAt, { weekday: "short" })}{" "}
                  um{" "}
                  {formatGermanTime(deletingSession.startedAt)}
                </b>
                <br />
                {deletingSession.segments.reduce((sum, segment) => sum + elapsedMinutes(segment.startedAt, segment.endedAt, segment.durationSeconds), 0).toLocaleString("de-DE", { maximumFractionDigits:2 })} Minuten ·{" "}
                {deletingSession.segments[0]?.type === "strength" ? "Kraft" : "Ausdauer"}
              </p>
              <p style={{ marginTop: "6px", color: "var(--muted)", fontSize: "11px" }}>
                Diese Einheit wird aus Verlauf und Wertung entfernt. Punkte, Trainingsminuten und Level werden neu berechnet. {deletingSession.source === "health_import" && "Die Löschmarkierung verhindert eine erneute Buchung desselben Health-Exports."}
              </p>
            </div>

            <label>Eltern-PIN zur Bestätigung (4 Ziffern)</label>
            <TouchPinpad value={deletePin} onChange={setDeletePin} />
            {deleteError && <p className="form-error">{deleteError}</p>}

            <button type="submit" className="delete-submit-btn" disabled={deletePin.length !== 4 || busyDelete}>
              {busyDelete ? "Wird entfernt …" : deletingSession.source === "health_import" ? "Aus Verlauf und Wertung entfernen" : "Endgültig löschen"}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
