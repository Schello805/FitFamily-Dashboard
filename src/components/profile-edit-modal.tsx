"use client";

import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { avatarNames } from "@/components/avatar-picker";
import { PersonalAvatarEditor } from "@/components/personal-avatar-editor";
import { Modal } from "@/components/modal";
import { TouchPinpad } from "@/components/touch-pinpad";
import {
  GOALS,
  AVATAR_DESIGN_IDS,
  getAvatarProgress,
  getFitnessStageCount,
  getStartingFitnessStages,
  physiqueLabel,
  type AvatarDesignId,
  type DashboardProfile
} from "@/lib/domain";

type ProfileEditModalProps = {
  profile: DashboardProfile;
  avatar: AvatarDesignId;
  onAvatarChange: (avatar: AvatarDesignId) => void;
  birthDate: string;
  onBirthDateChange: (birthDate: string) => void;
  startingFitness: number;
  onStartingFitnessChange: (stage: number) => void;
  pin: string;
  onPinChange: (pin: string) => void;
  secondsLeft: number;
  isMobile: boolean;
  busy: boolean;
  notice: string;
  resettingScore: boolean;
  onClose: () => void;
  onResetIdleTimer: () => void;
  onResetScore: (pin: string) => Promise<boolean>;
  onSubmit: (form: FormData, pin: string) => Promise<boolean>;
  onAvatarSaved: (saved: boolean) => void;
};

export function ProfileEditModal({
  profile,
  avatar,
  onAvatarChange,
  birthDate,
  onBirthDateChange,
  startingFitness,
  onStartingFitnessChange,
  pin,
  onPinChange,
  secondsLeft,
  isMobile,
  busy,
  notice,
  resettingScore,
  onClose,
  onResetIdleTimer,
  onResetScore,
  onSubmit,
  onAvatarSaved
}: ProfileEditModalProps) {
  const [pinAction, setPinAction] = useState<"save" | "reset" | null>(null);
  const [pendingForm, setPendingForm] = useState<FormData | null>(null);
  const locked = busy || resettingScore;

  function closePin() {
    if (locked) return;
    setPinAction(null);
    setPendingForm(null);
    onPinChange("");
  }

  async function confirmPin() {
    if (locked || pin.length !== 4) return;
    const success = pinAction === "reset" ? await onResetScore(pin)
      : pendingForm ? await onSubmit(pendingForm, pin) : false;
    if (success) closePin();
  }
  const stageCount = getFitnessStageCount(profile.id, birthDate || null);
  const preview = getAvatarProgress(startingFitness, profile.strengthMinutes, profile.enduranceMinutes, stageCount);

  return (
    <Modal onClose={onClose} closeDisabled={locked}>
      <form className="profile-edit-modal" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title" onSubmit={(event) => {
        event.preventDefault();
        setPendingForm(new FormData(event.currentTarget));
        onPinChange("");
        setPinAction("save");
      }} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" disabled={locked} onClick={onClose} aria-label="Profilbearbeitung schließen">×</button>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <span className="setup-badge">Profil bearbeiten</span>
          {!isMobile && (
            <button type="button" className="modal-idle-badge" onClick={onResetIdleTimer} title="Automatische Rückkehr zum Dashboard bei Inaktivität (Tippen zum Verlängern)">
              Dashboard in {secondsLeft}s
            </button>
          )}
        </div>
        <h2 id="profile-edit-title">Profil &amp; Familie für {profile.name}</h2>
        <p className="profile-edit-intro">Hier änderst du persönliche Daten, Geburtsdatum und E-Mail-Adresse. Unten kannst du den Punktestand zurücksetzen; der Trainingsverlauf bleibt erhalten.</p>
        <div className="profile-edit-preview-row">
          <Avatar
            id={profile.id}
            avatar={avatar}
            customAvatar={profile.customAvatar}
            color={profile.color}
            fitnessStage={preview.fitnessStage}
            physique={preview.physique}
            birthDate={birthDate || null}
            name={profile.name}
            size="medium"
          />
          <div className="preview-info">
            <strong>Vorschau: {physiqueLabel(preview.physique)} (Stufe {preview.fitnessStage} von {stageCount})</strong>
            <p>Basiert auf {Math.round(profile.strengthMinutes)} Min. Kraft und {Math.round(profile.enduranceMinutes)} Min. Ausdauer.</p>
          </div>
        </div>
        <div className="profile-edit-basics">
          <label>Anzeigename<input name="name" required maxLength={30} defaultValue={profile.name} /></label>
          <label>E-Mail-Adresse<input name="email" type="email" maxLength={254} defaultValue={profile.email ?? ""} placeholder="name@example.com" autoComplete="email" /></label>
          <label>Geburtsdatum<input name="birthDate" type="date" value={birthDate} onChange={(event) => onBirthDateChange(event.target.value)} /></label>
        </div>
        <div className="profile-edit-goals">
          <label>Meine Fitness-Stufe (Selbsteinschätzung)
            <select name="startingFitness" value={startingFitness} onChange={(event) => onStartingFitnessChange(Number(event.target.value))}>
              {getStartingFitnessStages(profile.id, birthDate || null).map((stage) => (
                <option key={stage.stage} value={stage.stage}>{stage.label} ({stage.description})</option>
              ))}
            </select>
            <small className="profile-field-hint">Manuelle Einschätzung deiner Fitness und Darstellung der Figur. Nicht dein Trainingslevel – dieser steigt durch abgeschlossene Trainings automatisch.</small>
          </label>
          <label>Trainingsziel<select name="goal" defaultValue={profile.goal}>{GOALS.map((goal) => <option key={goal}>{goal}</option>)}</select></label>
        </div>
        <label>Figur im Dashboard
          <select name="avatar" value={avatar} onChange={(event) => onAvatarChange(event.target.value as AvatarDesignId)}>
            {AVATAR_DESIGN_IDS.map((id) => <option key={id} value={id}>{avatarNames[id]}</option>)}
          </select>
        </label>
        <PersonalAvatarEditor
          profileId={profile.id}
          profileName={profile.name}
          avatar={avatar}
          fitnessStage={preview.fitnessStage}
          physique={preview.physique}
          birthDate={birthDate || null}
          hasSavedAvatar={Boolean(profile.customAvatar)}
          onSaved={onAvatarSaved}
        />
        {notice && <p className="form-error" role="alert">{notice}</p>}
        <button className="primary-submit" disabled={locked}>{busy ? "Wird gespeichert …" : "Änderungen speichern"}</button>
        <button type="button" className="profile-reset-score-button" disabled={locked} onClick={() => { onPinChange(""); setPinAction("reset"); }}>
          {resettingScore ? "Punkte werden zurückgesetzt …" : "Punktestand auf 0 setzen"}
        </button>
        {pinAction && <Modal className="personal-avatar-pin-backdrop" onClose={closePin} closeDisabled={locked}>
          <div className="confirm-modal-card personal-avatar-pin-card" role="dialog" aria-modal="true" aria-labelledby="profile-pin-title">
            <button type="button" className="modal-close" aria-label="PIN-Eingabe schließen" disabled={locked} onClick={closePin}>×</button>
            <h3 id="profile-pin-title">Eltern-PIN eingeben</h3>
            <p>{pinAction === "reset" ? `Punktestand von ${profile.name} auf 0 setzen? Der Trainingsverlauf bleibt erhalten.` : "Bestätige das Speichern deiner Profiländerungen."}</p>
            <TouchPinpad value={pin} onChange={onPinChange} disabled={locked} />
            {notice && <p className="form-error" role="alert">{notice}</p>}
            <div className="confirm-modal-actions">
              <button type="button" className="confirm-cancel-btn" disabled={locked} onClick={closePin}>Abbrechen</button>
              <button type="button" className="confirm-submit-btn primary" disabled={locked || pin.length !== 4} onClick={() => void confirmPin()}>{locked ? "Wird verarbeitet …" : pinAction === "reset" ? "Auf 0 setzen" : "Speichern"}</button>
            </div>
          </div>
        </Modal>}
      </form>
    </Modal>
  );
}
