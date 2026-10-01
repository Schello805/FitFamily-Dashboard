"use client";

import { usePathname } from "next/navigation";
import { MusicPlayer } from "@/components/music-player";
import { ThemeToggle } from "@/components/theme-toggle";

export function PersistentMusicPlayer() {
  const pathname = usePathname();
  const isDashboard = pathname === "/";
  const placement = isDashboard ? "dashboard-radio" : "subpage-radio";

  return (
    <div className={`persistent-radio ${placement}`}>
      {isDashboard && <ThemeToggle showLabel={true} className="radio-theme-toggle" />}
      <MusicPlayer />
    </div>
  );
}

