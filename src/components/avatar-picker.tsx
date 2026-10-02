"use client";

import Image from "next/image";
import { AVATAR_DESIGN_IDS, type AvatarDesignId } from "@/lib/domain";

const avatarNames: Record<AvatarDesignId, string> = {
  mama: "Mama",
  papa: "Papa",
  fabian: "Fabian",
  "fabian-alt": "Fabian · Design 2",
  frieda: "Frieda",
  "frieda-alt": "Frieda · Design 2"
};

export function AvatarPicker({ value, onChange, name = "avatar" }: { value: AvatarDesignId; onChange?: (value: AvatarDesignId) => void; name?: string }) {
  return <div className="avatar-picker" role="radiogroup" aria-label="Figur für das Dashboard auswählen">
    {AVATAR_DESIGN_IDS.map((avatarId) => <label className={value === avatarId ? "selected" : ""} key={avatarId}>
      <input type="radio" name={name} value={avatarId} {...(onChange ? { checked: value === avatarId, onChange: () => onChange(avatarId) } : { defaultChecked: value === avatarId })} />
      <Image src={`/assets/avatars/${avatarId}.webp`} alt="" width={44} height={64} unoptimized />
      <span>{avatarNames[avatarId]}</span>
    </label>)}
  </div>;
}
