"use client";

import { useRef } from "react";
import { Avatar } from "./avatar";
import { AvatarPicker } from "./avatar-picker";
import { Modal } from "./modal";
import { avatarAssetForProfile, getStartingFitnessStages, GOALS, type AvatarDesignId, type ProfileAvatar } from "@/lib/domain";

export type FamilyProfile = { id: string; name: string; score: number; email: string | null; birthDate: string | null; startingFitness: number; avatar: ProfileAvatar; goal: string };

export function AdminFamilyEditModal({ draft, age, busy, onChange, onClose, onSave }: {
  draft: FamilyProfile; age: number | null; busy: boolean;
  onChange: (draft: FamilyProfile) => void; onClose: () => void; onSave: () => void;
}) {
  const birthday = useRef<HTMLInputElement>(null);
  return <Modal onClose={onClose} closeDisabled={busy}>
    <form className="admin-edit-modal family-edit-modal" role="dialog" aria-modal="true" aria-labelledby="family-edit-title"
      onSubmit={event => { event.preventDefault(); onSave(); }}>
      <button type="button" className="modal-close" disabled={busy} onClick={onClose} aria-label="Profilbearbeitung schließen">×</button>
      <span className="setup-badge">Familie · Profil bearbeiten</span><h2 id="family-edit-title">{draft.name}</h2>
      <div className="family-avatar-preview"><Avatar id={draft.id} avatar={draft.avatar} fitnessStage={draft.startingFitness} physique="balanced" birthDate={draft.birthDate} name={draft.name} size="small" /><span>Deine Vorschau</span></div>
      <fieldset className="admin-edit-fields" disabled={busy}>
        <label>Name<input required maxLength={30} value={draft.name} onChange={event => onChange({ ...draft, name: event.target.value })} /></label>
        <label>E-Mail-Adresse<input type="email" maxLength={254} value={draft.email ?? ""} onChange={event => onChange({ ...draft, email: event.target.value || null })} placeholder="name@example.com" /></label>
        <label>Geburtsdatum<input ref={birthday} type="date" value={draft.birthDate ?? ""} onChange={event => {
          const birthDate = event.target.value || null;
          onChange({ ...draft, birthDate, startingFitness: Math.min(draft.startingFitness, getStartingFitnessStages(draft.id, birthDate).length) });
        }} /></label>
        <div className="family-age-field"><span>Alter (aus Geburtsdatum)</span><output>{age == null ? "Geburtsdatum eintragen" : `${age} Jahre`}</output><button type="button" onClick={() => birthday.current?.focus()}>Geburtsdatum ändern</button></div>
        <label>Aktuelle Fitnessstufe<select value={draft.startingFitness} onChange={event => onChange({ ...draft, startingFitness: Number(event.target.value) })}>
          {getStartingFitnessStages(draft.id, draft.birthDate).map(stage => <option key={stage.stage} value={stage.stage}>{stage.label} ({stage.description})</option>)}
        </select></label>
        <label>Trainingsziel<select value={draft.goal} onChange={event => onChange({ ...draft, goal: event.target.value })}>{GOALS.map(goal => <option key={goal}>{goal}</option>)}</select></label>
        <div className="wide-field"><span className="admin-field-label">Avatar auswählen</span><AvatarPicker value={avatarAssetForProfile(draft.id, draft.avatar) as AvatarDesignId} onChange={avatar => onChange({ ...draft, avatar })} /></div>
      </fieldset>
      <div className="exercise-admin-actions"><button type="button" className="confirm-cancel-btn" disabled={busy} onClick={onClose}>Abbrechen</button><button type="submit" disabled={busy}>{busy ? "Speichert …" : "Profil speichern"}</button></div>
    </form>
  </Modal>;
}
