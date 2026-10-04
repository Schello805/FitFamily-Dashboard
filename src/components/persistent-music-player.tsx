"use client";

import Link from "next/link";
import Image from "next/image";
import { LayoutDashboard } from "lucide-react";
import { MusicPlayer } from "@/components/music-player";
import { ThemeToggle } from "@/components/theme-toggle";

export function PersistentMusicPlayer() {
  return (
    <header className="app-media-header" aria-label="FitFamily · Radio und Anzeige">
      <div className="app-header-brand">
        <Link href="/" className="app-header-home"><Image src="/assets/fitfamily-logo.png" width={60} height={68} alt="FitFamily Logo" />FitFamily</Link>
        <Link href="/" className="app-header-dashboard"><LayoutDashboard size={18} />Dashboard</Link>
      </div>
      <div id="dashboard-header-slot" />
      <div className="persistent-radio">
        <ThemeToggle showLabel={true} className="radio-theme-toggle" />
        <MusicPlayer />
      </div>
    </header>
  );
}
