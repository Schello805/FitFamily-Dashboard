import Image from "next/image";
import { avatarProgressAssetForProfile, getFitnessStageCount, physiqueLabel, type AvatarPhysique, type ProfileAvatar } from "@/lib/domain";

type AvatarProps = {
  profile?: {
    id: string;
    avatar: ProfileAvatar;
    customAvatar?: boolean;
    color?: string;
    fitnessStage: number;
    physique: AvatarPhysique;
    name?: string;
    birthDate?: string | null;
  };
  id?: string;
  avatar?: ProfileAvatar;
  customAvatar?: boolean;
  customAvatarSrc?: string;
  customAvatarScale?: number;
  customAvatarOffsetX?: number;
  customAvatarOffsetY?: number;
  color?: string;
  birthDate?: string | null;
  fitnessStage?: number;
  physique?: AvatarPhysique;
  name?: string;
  size?: "small" | "medium" | "large";
  showChip?: boolean;
  className?: string;
};

export function Avatar({
  profile,
  id = profile?.id ?? "neutral",
  avatar = profile?.avatar ?? "neutral",
  customAvatar = profile?.customAvatar ?? false,
  customAvatarSrc,
  customAvatarScale = 1,
  customAvatarOffsetX = 0,
  customAvatarOffsetY = 0,
  color = profile?.color ?? "#22d3ee",
  birthDate = profile?.birthDate,
  fitnessStage = profile?.fitnessStage ?? 1,
  physique = profile?.physique ?? "balanced",
  name = profile?.name,
  size = "medium",
  showChip = true,
  className = ""
}: AvatarProps) {
  const level = fitnessStage;
  const label = physiqueLabel(physique);
  const stageCount = getFitnessStageCount(id, birthDate);
  const avatarAsset = avatarProgressAssetForProfile(id, avatar, fitnessStage, physique, stageCount);
  const sizeClass = size === "small" ? "avatar-small" : size === "large" ? "avatar-large" : "";
  const accessibleName = name
    ? `Avatar von ${name}: Fitnessstufe ${level} von ${stageCount}, ${label}`
    : `Avatar: Fitnessstufe ${level} von ${stageCount}, ${label}`;

  return (
    <div
      className={`avatar avatar-generated avatar-physique-${physique} ${sizeClass} ${className}`.trim()}
      style={{ "--profile": color } as React.CSSProperties}
      data-fitness-stage={fitnessStage}
      aria-label={accessibleName}
      title={`Fitnessstufe ${level} von ${stageCount} · ${label}`}
    >
      <div className={`avatar-canvas ${customAvatar ? "has-personal-head" : ""}`}>
        <Image
          className="avatar-sprite"
          src={`/assets/avatars/${avatarAsset}.webp`}
          alt=""
          width={size === "large" ? 333 : 222}
          height={size === "large" ? 666 : 444}
          unoptimized
          draggable={false}
        />
        {customAvatar && (
          <Image
            className="avatar-personal-head"
            src={customAvatarSrc ?? `/api/profiles/${encodeURIComponent(id)}/avatar`}
            alt=""
            width={512}
            height={512}
            unoptimized
            draggable={false}
            style={{
              "--personal-head-scale": customAvatarScale,
              "--personal-head-x": `${customAvatarOffsetX}%`,
              "--personal-head-y": `${customAvatarOffsetY}%`
            } as React.CSSProperties}
          />
        )}
      </div>
      {showChip && <div className="level-chip">Lvl {level}</div>}
    </div>
  );
}
