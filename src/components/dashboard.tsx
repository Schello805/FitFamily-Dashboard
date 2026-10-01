"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  CloudSun,
  Dumbbell,
  MapPin,
  Settings,
  Smartphone,
  Square,
  Trophy
} from "lucide-react";
import type { DashboardProfile } from "@/lib/domain";
import { LiveDuration } from "@/components/live-duration";
import { Avatar } from "@/components/avatar";
import { showToast } from "@/components/toast";

type Weather = { temperature: number; apparent: number; code: number; updatedAt: string } | null;

function GitHubIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.23.7-3.91-1.37-3.91-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.4-1.27.74-1.56-2.58-.29-5.29-1.29-5.29-5.69 0-1.26.45-2.29 1.2-3.1-.12-.3-.52-1.47.11-3.06 0 0 .98-.31 3.16 1.19a10.9 10.9 0 0 1 5.75 0c2.19-1.5 3.16-1.19 3.16-1.19.63 1.59.23 2.76.11 3.06.75.81 1.2 1.84 1.2 3.1 0 4.42-2.72 5.4-5.3 5.69.42.36.79 1.06.79 2.14v3.16c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" /></svg>;
}

function weatherLabel(code: number) {
  if (code === 0) return "Klar";
  if (code <= 3) return "Bewölkt";
  if (code <= 48) return "Nebel";
  if (code <= 67) return "Regen";
  if (code <= 77) return "Schnee";
  if (code <= 82) return "Schauer";
  return "Gewitter";
}

function useClock() {
  const [date, setDate] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setDate(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return date;
}


function GoalRing({ value, color, targetMinutes, targetPeriod }: { value: number; color: string; targetMinutes: number; targetPeriod: "Tag" | "Woche" }) {
  return (
    <div className="goal-ring" title={`DOSB-Bewegungsorientierung: ${targetMinutes} Minuten pro ${targetPeriod.toLowerCase()}. Der Ring zählt nur in FitFamily erfasste Trainingszeit, nicht Alltagsbewegung.`} aria-label={`${value} Prozent des Richtwerts von ${targetMinutes} Trainingsminuten pro ${targetPeriod.toLowerCase()}`} style={{ "--progress": `${Math.min(100, value) * 3.6}deg`, "--profile": color } as React.CSSProperties}>
      <span>{value}%</span>
      <small>{targetMinutes}/{targetPeriod === "Tag" ? "Tag" : "Wo."}</small>
    </div>
  );
}

export function Dashboard({
  initialProfiles,
  version,
  commitUrl,
  mobileQr,
  mobileUrl
}: {
  initialProfiles: DashboardProfile[];
  version: string;
  commitUrl?: string;
  mobileQr?: string;
  mobileUrl?: string;
}) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [weather, setWeather] = useState<Weather>(null);
  const clock = useClock();
  const [quietDismissed, setQuietDismissed] = useState(false);
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("fitfamily_idle_timeout");
      if (stored !== null) {
        const val = Number(stored);
        if (!Number.isNaN(val) && val >= 0) return val;
      }
    }
    return 5;
  });
  const [nightModeEnabled, setNightModeEnabled] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("fitfamily_night_mode");
      if (stored !== null) return stored === "true";
    }
    return true;
  });
  const [lastActivity, setLastActivity] = useState(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("fitfamily_test_quiet") === "1") {
      sessionStorage.removeItem("fitfamily_test_quiet");
      return Date.now() - 3600000;
    }
    return Date.now();
  });
  const [manualQuietActive, setManualQuietActive] = useState(false);
  const [activeQr, setActiveQr] = useState(mobileQr ?? "");
  const [activeUrl, setActiveUrl] = useState(mobileUrl ?? "");
  const [showQrModal, setShowQrModal] = useState(false);

  function enterQuietMode() {
    setQuietDismissed(false);
    setManualQuietActive(true);
    setLastActivity(Date.now() - 3600000);
  }

  // Inaktivitäts-Tracking: Bei jeder Interaktion Timer zurücksetzen
  useEffect(() => {
    let lastRecorded = Date.now();
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastRecorded > 2000) {
        lastRecorded = now;
        setLastActivity(now);
        setQuietDismissed(false);
        setManualQuietActive(false);
      }
    };

    window.addEventListener("pointerdown", handleActivity, { passive: true });
    window.addEventListener("touchstart", handleActivity, { passive: true });
    window.addEventListener("keydown", handleActivity, { passive: true });
    window.addEventListener("mousemove", handleActivity, { passive: true });
    window.addEventListener("scroll", handleActivity, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("scroll", handleActivity);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      const currentUrl = window.location.origin;
      if (currentUrl !== activeUrl) {
        import("qrcode").then(({ default: QRCode }) => {
          QRCode.toDataURL(currentUrl, {
            width: 380,
            margin: 1,
            color: { dark: "#06191d", light: "#ffffff" }
          }).then((qrData) => {
            setActiveQr(qrData);
            setActiveUrl(currentUrl);
          });
        });
      }
    }
  }, [activeUrl]);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      setProfiles(data.profiles);
      if (data.displaySettings) {
        setIdleTimeoutMinutes(data.displaySettings.idleTimeoutMinutes);
        setNightModeEnabled(data.displaySettings.nightModeEnabled);
        if (typeof window !== "undefined") {
          localStorage.setItem("fitfamily_idle_timeout", String(data.displaySettings.idleTimeoutMinutes));
          localStorage.setItem("fitfamily_night_mode", String(data.displaySettings.nightModeEnabled));
        }
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    fetch("/api/weather")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => data?.current && setWeather({
        temperature: data.current.temperature_2m,
        apparent: data.current.apparent_temperature,
        code: data.current.weather_code,
        updatedAt: data.current.time
      }))
      .catch(() => undefined);
  }, []);

  const dateText = useMemo(() => new Intl.DateTimeFormat("de-DE", {
    weekday: "long", day: "2-digit", month: "long"
  }).format(clock), [clock]);

  const minutesOfDay = clock.getHours() * 60 + clock.getMinutes();
  const hasActiveTraining = profiles.some((profile) => profile.activeTraining);
  const idleMinutes = (clock.getTime() - lastActivity) / 60000;

  // Ruhemodus aktiviert sich nur, wenn kein aktives Training läuft:
  // 1. Manuell per Button "Ruhe" oder Klick auf die Uhr
  // 2. Nach Inaktivität (Timeout > 0 und idleMinutes >= idleTimeoutMinutes) – 24/7 zu jeder Uhrzeit!
  // 3. ODER bei automatischer Nachtruhe (zwischen 22:30 und 06:30 Uhr), sofern Nachtruhe aktiv ist UND mindestens 1 Min. keine Interaktion stattfand
  const isIdleTimeoutReached = idleTimeoutMinutes > 0 && idleMinutes >= idleTimeoutMinutes;
  const isNightQuiet = nightModeEnabled && (minutesOfDay >= 22 * 60 + 30 || minutesOfDay < 6 * 60 + 30) && idleMinutes >= 1;
  const quietActive = !hasActiveTraining && !quietDismissed && (manualQuietActive || isIdleTimeoutReached || isNightQuiet);

  function wakeUp() {
    setLastActivity(Date.now());
    setQuietDismissed(true);
    setManualQuietActive(false);
  }

  async function stop(event: React.MouseEvent, profileId: string) {
    event.preventDefault();
    event.stopPropagation();
    const prof = profiles.find((p) => p.id === profileId);
    await fetch("/api/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop", profileId })
    });
    showToast({
      type: "info",
      title: "Training beendet & gespeichert",
      message: prof ? `Das Training für ${prof.name} wurde gestoppt.` : "Training wurde gestoppt."
    });
    await refresh();
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <section className="brand-block">
          <Image className="brand-logo" src="/assets/fitfamily-logo.png" alt="FitFamily Dashboard – Gesund, aktiv, gemeinsam" width={112} height={112} priority unoptimized />
          <div className="brand-tools">
            <Link className="admin-shortcut" href="/verwaltung" aria-label="Verwaltung öffnen">
              <Settings size={26} />
              <span className="tool-label">Setup</span>
            </Link>
            {activeQr && (
              <button
                type="button"
                className="header-qr-button"
                onClick={() => setShowQrModal(true)}
                title="Am Smartphone öffnen (Tippen zum Vergrößern)"
                aria-label="QR-Code zum Öffnen auf dem Smartphone anzeigen"
              >
                <Image
                  src={activeQr}
                  alt="QR-Code für Smartphone"
                  width={92}
                  height={92}
                  className="header-qr-thumbnail"
                  unoptimized
                />
                <span className="header-qr-label">
                  <Smartphone size={18} />
                  <span className="header-qr-texts">
                    <b>Handy</b>
                    <small>Scannen</small>
                  </span>
                </span>
              </button>
            )}
          </div>
        </section>
        <section className="weather-block" aria-label="Wetter in Bechhofen">
          <CloudSun size={36} />
          <div><strong>{weather ? `${Math.round(weather.temperature)}°` : "–°"}</strong><span>{weather ? weatherLabel(weather.code) : "Wetter lädt"}</span></div>
          <div className="location"><MapPin size={15} /> Bechhofen</div>
        </section>
        <section className="header-actions">
          <div
            className="clock-block"
            onClick={enterQuietMode}
            title="Tippen für Ruhemodus"
            style={{ cursor: "pointer" }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") enterQuietMode(); }}
          >
            <time>{clock.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</time>
            <span>{dateText}</span>
          </div>
        </section>
      </header>

      <section className="profile-grid" aria-label="Familienprofile">
        {profiles.map((profile) => (
          <Link href={`/profil/${profile.id}`} className={`profile-card ${profile.activeTraining ? "is-active" : ""}`} key={profile.id} style={{ "--profile": profile.color } as React.CSSProperties}>
            <div className="card-accent" />
            <div className="profile-heading">
              <Avatar profile={profile} />
              <div className="profile-name"><span>Profil</span><h2>{profile.name}</h2><p>{profile.goal}</p></div>
              <GoalRing value={profile.targetPercent} color={profile.color} targetMinutes={profile.targetMinutes} targetPeriod={profile.targetPeriod} />
            </div>

            <div className="score-row">
              <div className="score"><Trophy size={22} /><div><strong>{profile.score.toLocaleString("de-DE")}</strong><span>Gesamtpunkte</span></div></div>
              <div className="today"><strong>{profile.todayMinutes}</strong><span>Min. heute</span></div>
            </div>

            {profile.activeTraining ? (
              <div className="active-strip">
                <div className="pulse-dot" />
                {profile.activeTraining.type === "strength" ? <Dumbbell size={22} /> : <Activity size={22} />}
                <div>
                  <div className="active-strip-title">
                    <span>{profile.activeTraining.exerciseName ?? (profile.activeTraining.type === "strength" ? "Krafttraining" : "Ausdauertraining")}</span>
                    {clock.getTime() - new Date(profile.activeTraining.startedAt).getTime() > 2 * 60 * 60 * 1000 && (
                      <span className="long-running-badge" title="Training läuft seit über 2 Stunden. Automatische Pause nach 4 Stunden.">Läuft &gt;2h</span>
                    )}
                  </div>
                  <strong><LiveDuration since={profile.activeTraining.segmentStartedAt} /></strong>
                </div>
                <button className="stop-button" onClick={(event) => stop(event, profile.id)} aria-label={`Training von ${profile.name} stoppen`}><Square size={19} fill="currentColor" /></button>
              </div>
            ) : (
              <div className="plan-strip"><CalendarDays size={19} /><span>{profile.nextTraining ? `Heute: ${profile.nextTraining}` : "Heute frei · Training planen"}</span><b>Öffnen</b></div>
            )}
          </Link>
        ))}
      </section>

      <footer className="app-footer">
        <span className="system-online"><i /> Lokal verbunden</span>
        <span>Source Available von Michael Schellenberger</span>
        <a href={commitUrl ?? "https://github.com/Schello805/FitFamily-Dashboard"} target="_blank" rel="noreferrer"><GitHubIcon /> GitHub · Rev. {version}</a>
      </footer>
      {quietActive && (
        <button type="button" className="quiet-overlay" onClick={wakeUp} aria-label="Ruhemodus beenden">
          <span>{clock.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
          <strong>Ruhemodus</strong>
          <small>Zum Aufwecken berühren oder Taste drücken</small>
        </button>
      )}

      {showQrModal && activeQr && (
        <div className="modal-backdrop" onClick={() => setShowQrModal(false)}>
          <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setShowQrModal(false)}
              aria-label="Schließen"
            >
              ×
            </button>
            <div className="pair-icon">
              <Smartphone size={32} />
            </div>
            <span className="setup-badge">Auf dem Smartphone</span>
            <h2>Mit Handy verbinden</h2>
            <p>Scanne diesen Code mit der Handykamera, um FitFamily auf deinem Smartphone zu öffnen (im selben WLAN).</p>
            <Image
              src={activeQr}
              alt="QR-Code für Smartphone-Zugriff"
              width={300}
              height={300}
              className="modal-qr-img"
              unoptimized
            />
            {activeUrl && (
              <div className="qr-caption">
                <strong>{activeUrl}</strong>
                <span>Tipp: Im Handy-Browser zu den Lesezeichen oder zum Startbildschirm hinzufügen.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
