"use client";

import { usePathname } from "next/navigation";
import { MusicPlayer } from "@/components/music-player";

export function PersistentMusicPlayer() {
  const pathname = usePathname();
  const placement = pathname === "/" ? "dashboard-radio" : "subpage-radio";

  return <div className={`persistent-radio ${placement}`}><MusicPlayer /></div>;
}
