"use client";

import { useEffect, useState } from "react";

export function LiveDuration({ since, compact = false }: { since: string; compact?: boolean }) {
  // A shared placeholder prevents server/client clock differences during hydration.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setNow(Date.now()));
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, []);
  if (now === null) return <span>{compact ? "--:--" : "--:--:--"}</span>;
  const seconds = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return <span>{hours > 0 ? `${hours}:` : compact ? "" : "00:"}{String(minutes).padStart(2, "0")}:{String(rest).padStart(2, "0")}</span>;
}
