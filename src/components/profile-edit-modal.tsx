"use client";

import type { FormEventHandler } from "react";
import { Avatar } from "@/components/avatar";
import { AvatarPicker } from "@/components/avatar-picker";
import { PersonalAvatarEditor } from "@/components/personal-avatar-editor";
import { Modal } from "@/components/modal";
import {
  GOALS,
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
  onResetScore: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
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
  const stageCount = getFitnessStageCount(profile.id, birthDate || null);
  const preview = getAvatarProgress(startingFitness, profile.strengthMinutes, profile.enduranceMinutes, stageCount);

  return (
    <Modal onClose={onClose} closeDisabled={busy}>
      <form className="profile-edit-modal" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title" onSubmit={onSubmit} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" disabled={busy} onClick={onClose} aria-label="Profilbearbeitung schließen">×</button>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <span className="setup-badge">Profil bearbeiten</span>
          {!isMobile && (
            <button type="button" className="modal-idle-badge" onClick={onResetIdleTimer} title="Automatische Rückkehr zum Dashboard bei Inaktivität (Tippen zum Verlängern)">
              Dashboard in {secondsLeft}s
            </button>
          )}
        </div>
        <h2 id="profile-edit-title">Angaben für {profile.name}</h2>
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
            <small className="profile-field-hint">Erwachsene: 7 Stufen, Kinder: 3. Wähle deine aktuelle Stufe selbst; Trainingszeiten ändern sie nicht automatisch.</small>
          </label>
          <label>Trainingsziel<select name="goal" defaultValue={profile.goal}>{GOALS.map((goal) => <option key={goal}>{goal}</option>)}</select></label>
        </div>
        <div className="avatar-choice">
          <span>Figur im Dashboard</span>
          <AvatarPicker value={avatar} onChange={onAvatarChange} />
        </div>
        <label>Eltern-PIN · 4 Ziffern<input name="pin" type="password" inputMode="numeric" autoComplete="current-password" minLength={4} maxLength={4} pattern="[0-9]{4}" value={pin} onChange={(event) => onPinChange(event.target.value.replace(/\D/g, "").slice(0, 4))} required /></label>
        <PersonalAvatarEditor
          profileId={profile.id}
          profileName={profile.name}
          avatar={avatar}
          fitnessStage={preview.fitnessStage}
          physique={preview.physique}
          birthDate={birthDate || null}
          pin={pin}
          setPin={onPinChange}
          hasSavedAvatar={Boolean(profile.customAvatar)}
          onSaved={onAvatarSaved}
        />
        {notice && <p className="form-error" role="alert">{notice}</p>}
        <button className="primary-submit" disabled={busy}>{busy ? "Wird gespeichert …" : "Änderungen speichern"}</button>
        <button type="button" className="profile-reset-score-button" disabled={busy || resettingScore} onClick={onResetScore}>
          {resettingScore ? "Punkte werden zurückgesetzt …" : "Punktestand auf 0 setzen"}
        </button>
      </form>
    </Modal>
  );
}
