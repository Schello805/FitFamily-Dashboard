"use client";

import Image from "next/image";
import { AVATAR_IDS, type AvatarId } from "@/lib/domain";

const avatarNames: Record<AvatarId, string> = {
  mama: "Mama",
  papa: "Papa",
  fabian: "Fabian",
  frieda: "Frieda"
};

export function AvatarPicker({ value, onChange, name = "avatar" }: { value: AvatarId; onChange?: (value: AvatarId) => void; name?: string }) {
  return <div className="avatar-picker" role="radiogroup" aria-label="Figur für das Dashboard auswählen">
    {AVATAR_IDS.map((avatarId) => <label className={value === avatarId ? "selected" : ""} key={avatarId}>
      <input type="radio" name={name} value={avatarId} {...(onChange ? { checked: value === avatarId, onChange: () => onChange(avatarId) } : { defaultChecked: value === avatarId })} />
      <Image src={`/assets/avatars/${avatarId}.webp`} alt="" width={44} height={64} unoptimized />
      <span>{avatarNames[avatarId]}</span>
    </label>)}
  </div>;
}
