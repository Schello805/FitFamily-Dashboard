"use client";

import Link from "next/link";
import Image from "next/image";
import { DashboardHeader } from "./dashboard-header";
import { HealthDailyMetrics } from "./health-daily-metrics";
import { useEffect, useMemo, useState } from "react";
import {
  CloudSun,
  MapPin,
  Settings,
  Smartphone,
  Trophy,
} from "lucide-react";
import type { DashboardProfile } from "@/lib/domain";
import { LiveDuration } from "@/components/live-duration";
import { Avatar } from "@/components/avatar";
import { ActivityTrendChart } from "@/components/activity-trend-chart";
import { UserHelp } from "@/components/user-help";
import { DEFAULT_DISPLAY_SETTINGS, type DisplaySettings } from "@/lib/display-settings-shared";
import { requestJson } from "@/lib/api-client";
import { formatGermanDate, formatGermanTime } from "@/lib/date-format";
import { cacheDisplaySettings } from "@/lib/theme";
import { isWithinNightWindow, weeklyTargetFraction } from "@/lib/display-time";
import { Modal } from "@/components/modal";
import { ConnectionStatus } from "@/components/connection-status";
import { useDashboardConnection } from "@/components/use-dashboard-connection";
import { GymondoLaunch } from "@/components/gymondo-launch";

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


export function GoalRing({ value, color, targetMinutes, targetPeriod, actualMinutes, clock, timeZone }: { value: number; color: string; targetMinutes: number; targetPeriod: "Tag" | "Woche"; actualMinutes?: number; clock?: Date; timeZone?: string }) {
  const rawProgress = actualMinutes !== undefined && Number.isFinite(actualMinutes) ? actualMinutes / targetMinutes * 100 : value;
  const progress = Math.max(0, Math.min(100, Number.isFinite(rawProgress) ? rawProgress : 0));
  const expected = targetPeriod === "Woche" && clock ? weeklyTargetFraction(clock, timeZone) * 100 : 0;
  const expectedMinutes = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(targetMinutes * expected / 100);
  const paceExplanation = expected ? ` Bis einschließlich heute: ${expectedMinutes} Minuten. Orange zeigt den noch fehlenden Fortschritt bis zum heutigen Soll; dein Trainingsfortschritt liegt darüber.` : "";
  return (
    <div className="goal-ring-summary" role="img" aria-label={`Trainingsziel: ${value} Prozent von ${targetMinutes} Minuten pro ${targetPeriod.toLowerCase()}.${paceExplanation}`} title={`Dein ${targetPeriod === "Tag" ? "Tagesziel" : "Wochenziel"}: ${targetMinutes} Trainingsminuten. Erfasste Kraft- und Ausdauerminuten füllen den Kreis; nach Ablauf des Zeitraums beginnt er neu. Ein Punkte-Reset verändert den Zielkreis und Trainingslevel nicht.${paceExplanation}`}>
      <span className={`goal-ring ${value >= 100 ? "goal-reached" : ""}`} aria-hidden="true" style={{ "--profile": color } as React.CSSProperties}>
        <svg className="goal-ring-visual" viewBox="0 0 100 100"><circle className="goal-ring-track" cx="50" cy="50" r="44" />{progress < expected && <circle className="goal-ring-expected" cx="50" cy="50" r="44" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - expected} />}<circle className="goal-ring-fill" cx="50" cy="50" r="44" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - progress} /></svg>
        <strong>{value}%</strong>
        <small>ZIEL</small>
      </span>
      <span className="goal-ring-target">SOLL {targetMinutes} Minuten/{targetPeriod === "Tag" ? "Tag" : "Woche"}</span>
      {expected > 0 && <span className="goal-ring-pace" title={paceExplanation}>Bis heute: {expectedMinutes} Min.</span>}
    </div>
  );
}

function ProfileDashboardCard({ profile, clock, timeZone }: { profile: DashboardProfile; clock: Date; timeZone: string }) {
  return (
    <article className={`profile-card ${profile.activeTraining ? "is-active" : ""}`} style={{ "--profile": profile.color } as React.CSSProperties}>
      <div className="card-accent" />
      <div className="profile-heading">
        <Link className="profile-identity profile-card-link" href={`/profil/${profile.id}`} aria-label={`${profile.name}: Profil öffnen`}>
          <Avatar profile={profile} />
          <div className="profile-name"><span>Profil</span><h2>{profile.name}</h2><p>{profile.goal}</p></div>
        </Link>
        <ActivityTrendChart points={profile.activityTrend} color={profile.color} targetMinutes={profile.targetMinutes} targetPeriod={profile.targetPeriod} profileName={profile.name} />
        <GoalRing value={profile.targetPercent} color={profile.color} targetMinutes={profile.targetMinutes} targetPeriod={profile.targetPeriod} actualMinutes={profile.targetActualMinutes} clock={clock} timeZone={timeZone} />
      </div>

      <div className="score-row">
        <div className="score" title="Trainingspunkte: Kraft 1, Ausdauer 2, importierte Health-Trainings 1,5 Punkte/Minute. Aktive kcal zählen nicht als Punkte. Nach einem Punkte-Reset zählen nur neue Trainingsminuten."><Trophy size={22} /><div><strong key={profile.score} className="score-value">{profile.score.toLocaleString("de-DE")}</strong><span>{profile.scoreResetAt ? "Punkte seit Reset" : "Gesamtpunkte"}</span></div></div>
        <div className="today"><strong>{profile.todayMinutes}</strong><span>Minuten heute</span></div>
      </div>
      <HealthDailyMetrics value={profile.healthEnergy} trend={profile.healthDailyTrend} clock={clock} />
      {profile.trainingProgress && <div className="dashboard-level" aria-label={`Trainingslevel ${profile.trainingProgress.level}, automatischer Aufstieg`} title="1 abgeschlossene Trainingsminute = 1 Level-Fortschrittspunkt. Level 2 ab 150, Level 3 ab 450, Level 4 ab 900 Minuten. Kraft und Ausdauer zählen gleich; kein wöchentlicher Reset."><span key={profile.trainingProgress.level} className="level-value">★ Trainingslevel {profile.trainingProgress.level}</span><div role="progressbar" aria-label="Trainingslevel-Fortschritt" aria-valuemin={0} aria-valuemax={100} aria-valuenow={profile.trainingProgress.percent}><i style={{ width: `${profile.trainingProgress.percent}%` }} /></div><small>{profile.trainingProgress.nextThreshold === null ? "Maximum erreicht" : `Level ${profile.trainingProgress.level + 1} in ${profile.trainingProgress.remaining} Min.`}</small></div>}
      {profile.activeTraining && (
        <div className="active-strip">
          <div className="pulse-dot" />
          <span className="active-training-kind">{profile.activeTraining.type === "strength" ? "Krafttraining" : "Ausdauertraining"}</span>
          {profile.activeTraining.recordingMode === "health" && <small>Health zählt · App-Timer ohne Wertung</small>}
          <div>
            <div className="active-strip-title">
              <span>{profile.activeTraining.exerciseName ?? (profile.activeTraining.type === "strength" ? "Krafttraining" : "Ausdauertraining")}</span>
              {clock.getTime() - new Date(profile.activeTraining.startedAt).getTime() > 2 * 60 * 60 * 1000 && (
                <span className="long-running-badge" title="Training läuft seit über 2 Stunden. Automatische Pause nach 4 Stunden.">Läuft &gt;2h</span>
              )}
            </div>
            <strong><LiveDuration since={profile.activeTraining.segmentStartedAt} /></strong>
          </div>
        </div>
      )}
    </article>
  );
}

export function Dashboard({
  initialProfiles,
  version,
  revision,
  commitUrl,
  mobileQr,
  mobileUrl
}: {
  initialProfiles: DashboardProfile[];
  version: string;
  revision: string;
  commitUrl?: string;
  mobileQr?: string;
  mobileUrl?: string;
}) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [weather, setWeather] = useState<Weather>(null);
  const clock = useClock();
  const [quietDismissed, setQuietDismissed] = useState(false);
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("fitfamily_display_settings");
        if (stored) return { ...DEFAULT_DISPLAY_SETTINGS, ...JSON.parse(stored) };
      } catch {}
      const oldIdle = localStorage.getItem("fitfamily_idle_timeout");
      const oldNight = localStorage.getItem("fitfamily_night_mode");
      return {
        ...DEFAULT_DISPLAY_SETTINGS,
        idleTimeoutMinutes: oldIdle !== null && !Number.isNaN(Number(oldIdle)) ? Number(oldIdle) : DEFAULT_DISPLAY_SETTINGS.idleTimeoutMinutes,
        nightModeEnabled: oldNight !== null ? oldNight === "true" : DEFAULT_DISPLAY_SETTINGS.nightModeEnabled,
      };
    }
    return DEFAULT_DISPLAY_SETTINGS;
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
  const [appUpdateAvailable, setAppUpdateAvailable] = useState(false);

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

  const { lastRefreshedAt, connectionError } = useDashboardConnection((data) => {
    setProfiles(data.profiles);
    if (data.displaySettings) {
      setDisplaySettings(data.displaySettings);
      cacheDisplaySettings(data.displaySettings);
    }
  });

  useEffect(() => {
    let disposed = false;
    const checkForAppUpdate = async () => {
      try {
        const current = await requestJson<{ version?: string; commit?: string }>(
          "/api/version", "Version konnte nicht geprüft werden.", { cache: "no-store" }
        );
        if (!disposed && (current.version !== version || current.commit !== revision)) setAppUpdateAvailable(true);
      } catch { /* A temporarily unavailable version endpoint should not disturb the dashboard. */ }
    };
    void checkForAppUpdate();
    const timer = window.setInterval(() => void checkForAppUpdate(), 30_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [revision, version]);

  useEffect(() => {
    if (appUpdateAvailable && !profiles.some((profile) => profile.activeTraining)) window.location.reload();
  }, [appUpdateAvailable, profiles]);

  useEffect(() => {
    requestJson<{ current?: { temperature_2m: number; apparent_temperature: number; weather_code: number; time: string } }>(
      "/api/weather", "Wetter ist nicht verfügbar."
    )
      .then((data) => data?.current && setWeather({
        temperature: data.current.temperature_2m,
        apparent: data.current.apparent_temperature,
        code: data.current.weather_code,
        updatedAt: data.current.time
      }))
      .catch(() => undefined);
  }, []);

  const dateText = useMemo(() => formatGermanDate(clock, { timeZone: displaySettings.timeZone, weekday: "long", day: "2-digit", month: "long", year: undefined }), [clock, displaySettings.timeZone]);

  const hasActiveTraining = profiles.some((profile) => profile.activeTraining);
  const idleMinutes = (clock.getTime() - lastActivity) / 60000;

  // Ruhemodus aktiviert sich, wenn kein aktives Training läuft:
  // 1. Manuell per Klick auf die Uhr
  // 2. Automatisch nach Inaktivität basierend auf Tages- oder Nacht-Timeout
  const isNight = displaySettings.nightModeEnabled && isWithinNightWindow(clock, displaySettings.nightStartTime, displaySettings.nightEndTime, displaySettings.timeZone);
  const effectiveTimeout = isNight ? displaySettings.nightIdleTimeoutMinutes : displaySettings.idleTimeoutMinutes;
  const isTimeoutReached = effectiveTimeout > 0 && idleMinutes >= effectiveTimeout;
  const quietActive = !hasActiveTraining && !quietDismissed && (manualQuietActive || isTimeoutReached);
  const isDimmed = isNight || (effectiveTimeout > 0 && idleMinutes >= effectiveTimeout + 15);

  const pixelShift = useMemo(() => {
    if (!quietActive) return { x: 0, y: 0 };
    // Burn-In-Schutz: Berechnet alle 4 Minuten eine sanfte Position (-18px bis +18px)
    const cycle = Math.floor(clock.getTime() / (4 * 60 * 1000));
    const angle = (cycle * 137.5 * Math.PI) / 180;
    return {
      x: Math.round(Math.cos(angle) * 18),
      y: Math.round(Math.sin(angle) * 14)
    };
  }, [quietActive, clock]);

  function wakeUp() {
    setLastActivity(Date.now());
    setQuietDismissed(true);
    setManualQuietActive(false);
  }

  return (
    <main className="dashboard-shell">
      <DashboardHeader>
        <section className="brand-block">
          <Image className="brand-logo" src="/assets/fitfamily-logo.png" alt="FitFamily Dashboard – Gesund, aktiv, gemeinsam" width={112} height={112} priority unoptimized />
          <div className="brand-tools">
            <GymondoLaunch />
            <UserHelp />
            <Link className="admin-shortcut" href="/verwaltung" aria-label="Verwaltung öffnen" title="Einstellungen & Verwaltung öffnen (PIN, Backup, Ruhezustand, Updates)">
              <Settings size={26} />
              <span className="tool-label">Setup</span>
            </Link>
            {activeQr && (
              <button
                type="button"
                className="header-qr-button"
                onClick={() => setShowQrModal(true)}
                title="Am Smartphone öffnen: QR-Code vergrößern für mobile Trainingssteuerung"
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
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); enterQuietMode(); } }}
          >
            <time>{formatGermanTime(clock, displaySettings.timeZone)}</time>
            <span>{dateText}</span>
          </div>
        </section>
      </DashboardHeader>

      <section className="profile-grid" aria-label="Familienprofile">
        {profiles.map((profile) => <ProfileDashboardCard key={profile.id} profile={profile} clock={clock} timeZone={displaySettings.timeZone} />)}
      </section>

      <footer className="app-footer">
        <ConnectionStatus connectionError={connectionError} lastRefreshedAt={lastRefreshedAt} />
        <span>Source Available von Michael Schellenberger</span>
        <a href={commitUrl ?? "https://github.com/Schello805/FitFamily-Dashboard"} target="_blank" rel="noreferrer"><GitHubIcon /> GitHub · v{version} · Rev. {revision}</a>
      </footer>
      {quietActive && (
        <button
          type="button"
          className={`quiet-overlay ${isDimmed ? "is-dimmed" : ""}`}
          onClick={wakeUp}
          aria-label="Ruhemodus beenden"
        >
          <div
            className="quiet-content-wrap"
            style={{ transform: `translate3d(${pixelShift.x}px, ${pixelShift.y}px, 0)` }}
          >
            <span className="quiet-time">{formatGermanTime(clock, displaySettings.timeZone)}</span>
            <span className="quiet-date">{dateText}</span>
            {weather && (
              <div className="quiet-weather">
                <CloudSun size={22} />
                <span>{Math.round(weather.temperature)}° · {weatherLabel(weather.code)} · Bechhofen</span>
              </div>
            )}
            <strong>{isNight ? "Nachtruhe" : "Ruhemodus"}</strong>
            <small>Zum Aufwecken berühren oder Taste drücken</small>
          </div>
        </button>
      )}

      {showQrModal && activeQr && (
        <Modal onClose={() => setShowQrModal(false)}>
          <div className="qr-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-qr-title">
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
            <h2 id="dashboard-qr-title">Mit Handy verbinden</h2>
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
        </Modal>
      )}

    </main>
  );
}
