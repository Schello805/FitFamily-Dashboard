"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function KioskIdleBar({
  redirectUrl = "/",
  seconds = 60,
  color,
  title = "Inaktivitäts-Timer: Zurück zum Dashboard",
  paused = false
}: {
  redirectUrl?: string;
  seconds?: number;
  color?: string;
  title?: string;
  paused?: boolean;
}) {
  const router = useRouter();
  const [totalSeconds] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("fitfamily_subpage_idle_timeout");
        if (stored !== null && !isNaN(Number(stored))) {
          return Number(stored);
        }
      } catch {}
    }
    return seconds;
  });

  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);
  const [progress, setProgress] = useState(100);
  const deadlineRef = useRef<number | null>(null);
  const pausedRemainingRef = useRef<number | null>(null);

  const resetTimer = useCallback(() => {
    if (totalSeconds <= 0) return;
    deadlineRef.current = Date.now() + totalSeconds * 1000;
    setSecondsLeft(totalSeconds);
    setProgress(100);
  }, [totalSeconds]);

  useEffect(() => {
    if (typeof window === "undefined" || totalSeconds <= 0) return;

    if (paused) {
      pausedRemainingRef.current = deadlineRef.current === null
        ? pausedRemainingRef.current ?? totalSeconds * 1000
        : Math.max(0, deadlineRef.current - Date.now());
      deadlineRef.current = null;
      setSecondsLeft(Math.ceil(pausedRemainingRef.current / 1000));
      setProgress((pausedRemainingRef.current / (totalSeconds * 1000)) * 100);
      return;
    }

    deadlineRef.current = Date.now() + (pausedRemainingRef.current ?? totalSeconds * 1000);
    pausedRemainingRef.current = null;
    const handleActivity = () => resetTimer();
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));

    const interval = window.setInterval(() => {
      if (!deadlineRef.current) return;
      const remainingMs = Math.max(0, deadlineRef.current - Date.now());
      const remainingSec = Math.ceil(remainingMs / 1000);
      setSecondsLeft(remainingSec);
      setProgress((remainingMs / (totalSeconds * 1000)) * 100);

      if (remainingMs <= 0) {
        window.clearInterval(interval);
        router.push(redirectUrl);
      }
    }, 250);

    return () => {
      window.clearInterval(interval);
      events.forEach((event) => window.removeEventListener(event, handleActivity));
    };
  }, [totalSeconds, redirectUrl, router, resetTimer, paused]);

  if (totalSeconds <= 0) return null;

  return (
    <div
      className="profile-idle-bar-container"
      onClick={() => { if (!paused) router.push(redirectUrl); }}
      title={paused ? "Rückkehr-Timer pausiert, während das Video geöffnet ist" : `${title}: Noch ${secondsLeft}s (Klick zum sofortigen Verlassen)`}
      style={{ cursor: paused ? "default" : "pointer" }}
    >
      <div
        className="profile-idle-bar-fill"
        style={{
          width: `${progress}%`,
          ...(color ? { background: color, boxShadow: `0 0 10px ${color}` } : {})
        }}
      />
    </div>
  );
}
