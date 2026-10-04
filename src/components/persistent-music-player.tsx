"use client";

import Link from "next/link";
import { MusicPlayer } from "@/components/music-player";
import { ThemeToggle } from "@/components/theme-toggle";

export function PersistentMusicPlayer() {
  return (
    <header className="app-media-header" aria-label="FitFamily · Radio und Anzeige">
      <Link href="/" className="app-header-home">FitFamily <span>Dashboard</span></Link>
      <div id="dashboard-header-slot" />
      <div className="persistent-radio">
        <ThemeToggle showLabel={true} className="radio-theme-toggle" />
        <MusicPlayer />
      </div>
    </header>
  );
}
