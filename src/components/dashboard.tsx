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
  Trophy,
  X
} from "lucide-react";
import type { DashboardProfile } from "@/lib/domain";
import { LiveDuration } from "@/components/live-duration";
import { Avatar } from "@/components/avatar";
import { AppleActivityRings } from "@/components/apple-activity-rings";
import { UserHelp } from "@/components/user-help";
import { showToast } from "@/components/toast";
import { DEFAULT_DISPLAY_SETTINGS, type DisplaySettings } from "@/lib/display-settings-shared";

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


function isWithinNightWindow(clock: Date, startTimeStr?: string, endTimeStr?: string): boolean {
  const [startH, startM] = (startTimeStr || "22:30").split(":").map(Number);
  const [endH, endM] = (endTimeStr || "06:30").split(":").map(Number);
  const current = clock.getHours() * 60 + clock.getMinutes();
  const start = (Number.isFinite(startH) ? startH : 22) * 60 + (Number.isFinite(startM) ? startM : 30);
  const end = (Number.isFinite(endH) ? endH : 6) * 60 + (Number.isFinite(endM) ? endM : 30);
  if (start > end) return current >= start || current < end;
  return current >= start && current < end;
}

function GoalRing({ value, color, targetMinutes, targetPeriod, onClick }: { value: number; color: string; targetMinutes: number; targetPeriod: "Tag" | "Woche"; onClick: () => void }) {
  return (
    <button type="button" className="goal-ring-button" onClick={onClick} aria-label={`Bewegungsziel: ${value} Prozent von ${targetMinutes} Minuten pro ${targetPeriod.toLowerCase()}. Erklärung öffnen`}>
      <span className="goal-ring" aria-hidden="true" style={{ "--progress": `${Math.min(100, value) * 3.6}deg`, "--profile": color } as React.CSSProperties}>
        <strong>{value}%</strong>
        <small>IST</small>
      </span>
      <span className="goal-ring-target">SOLL {targetMinutes} Min/{targetPeriod === "Tag" ? "Tag" : "Woche"}</span>
    </button>
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
  const [goalInfoProfileId, setGoalInfoProfileId] = useState<string | null>(null);
  const [stoppingProfileId, setStoppingProfileId] = useState<string | null>(null);
  const [appUpdateAvailable, setAppUpdateAvailable] = useState(false);
  const goalInfoProfile = profiles.find((profile) => profile.id === goalInfoProfileId) ?? null;

  useEffect(() => {
    if (!goalInfoProfileId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGoalInfoProfileId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [goalInfoProfileId]);

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
        setDisplaySettings(data.displaySettings);
        if (typeof window !== "undefined") {
          localStorage.setItem("fitfamily_display_settings", JSON.stringify(data.displaySettings));
        }
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    let disposed = false;
    const checkForAppUpdate = async () => {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const current = await response.json() as { version?: string; commit?: string };
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

  const hasActiveTraining = profiles.some((profile) => profile.activeTraining);
  const idleMinutes = (clock.getTime() - lastActivity) / 60000;

  // Ruhemodus aktiviert sich, wenn kein aktives Training läuft:
  // 1. Manuell per Klick auf die Uhr
  // 2. Automatisch nach Inaktivität basierend auf Tages- oder Nacht-Timeout
  const isNight = displaySettings.nightModeEnabled && isWithinNightWindow(clock, displaySettings.nightStartTime, displaySettings.nightEndTime);
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

  async function stop(event: React.MouseEvent, profileId: string) {
    event.preventDefault();
    event.stopPropagation();
    if (stoppingProfileId) return;
    const prof = profiles.find((p) => p.id === profileId);
    setStoppingProfileId(profileId);
    try {
      const response = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", profileId })
      });
      const result = await response.json().catch(() => ({})) as { changed?: boolean; error?: string };
      if (response.ok && result.changed) {
        showToast({
          type: "info",
          title: "Training beendet & gespeichert",
          message: prof ? `Das Training für ${prof.name} wurde gestoppt.` : "Training wurde gestoppt."
        });
      } else if (response.ok) {
        showToast({ type: "error", title: "Kein aktives Training gefunden", message: "Die Anzeige wird aktualisiert. Falls das Training noch läuft, tippe bitte erneut auf Stopp." });
      } else {
        showToast({
          type: "error",
          title: "Fehler beim Beenden",
          message: result.error ?? "Das Training konnte nicht gestoppt werden."
        });
      }
    } catch {
      showToast({
        type: "error",
        title: "Verbindungsfehler",
        message: "Server konnte nicht erreicht werden."
      });
    } finally {
      await refresh().catch(() => undefined);
      setStoppingProfileId(null);
    }
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <section className="brand-block">
          <Image className="brand-logo" src="/assets/fitfamily-logo.png" alt="FitFamily Dashboard – Gesund, aktiv, gemeinsam" width={112} height={112} priority unoptimized />
          <div className="brand-tools">
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
                title="Am Smartphone öffnen: QR-Code vergrößern für mobile Nutzung & Apple Health"
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
          <article className={`profile-card ${profile.activeTraining ? "is-active" : ""}`} key={profile.id} style={{ "--profile": profile.color } as React.CSSProperties}>
            <div className="card-accent" />
            <div className="profile-heading">
              <Link className="profile-heading-link" href={`/profil/${profile.id}`} aria-label={`${profile.name}: Profil öffnen`}>
                <Avatar profile={profile} />
                <div className="profile-name"><span>Profil</span><h2>{profile.name}</h2><p>{profile.goal}</p></div>
              </Link>
              <div className="dashboard-history-placeholder" aria-label="Platzhalter für den späteren Entwicklungsverlauf">
                <span>VERLAUF FOLGT</span>
                <svg viewBox="0 0 180 42" aria-hidden="true" focusable="false">
                  <path className="history-placeholder-target" d="M2 30 C28 28 36 17 58 20 S88 31 112 18 S147 14 178 7" />
                  <path className="history-placeholder-actual" d="M2 35 C22 34 35 29 54 31 S83 20 103 26 S143 20 178 17" />
                </svg>
              </div>
              <GoalRing value={profile.targetPercent} color={profile.color} targetMinutes={profile.targetMinutes} targetPeriod={profile.targetPeriod} onClick={() => setGoalInfoProfileId(profile.id)} />
            </div>

            <div className="score-row">
              <div className="score"><Trophy size={22} /><div><strong>{profile.score.toLocaleString("de-DE")}</strong><span>Gesamtpunkte</span></div></div>
              <div className="today"><strong>{profile.todayMinutes}</strong><span>Min. heute</span></div>
            </div>

            {profile.appleHealthRings && <div className="dashboard-apple-rings"><AppleActivityRings rings={profile.appleHealthRings} compact /></div>}

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
                <button type="button" className="stop-button" disabled={stoppingProfileId !== null} onClick={(event) => stop(event, profile.id)} aria-label={`Training von ${profile.name} stoppen`} title="Training jetzt beenden">
                  <Square size={19} fill="currentColor" />
                  <span>{stoppingProfileId === profile.id ? "Stoppt …" : "Stopp"}</span>
                </button>
              </div>
            ) : (
              <Link href={`/profil/${profile.id}`} className="plan-strip"><CalendarDays size={19} /><span>{profile.nextTraining ? `Heute: ${profile.nextTraining}` : "Heute frei · Training planen"}</span><b>Öffnen</b></Link>
            )}
          </article>
        ))}
      </section>

      <footer className="app-footer">
        <span className="system-online"><i /> Lokal verbunden</span>
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
            <span className="quiet-time">{clock.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
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

      {goalInfoProfile && (
        <div className="goal-info-backdrop" onClick={() => setGoalInfoProfileId(null)}>
          <section className="goal-info-modal" role="dialog" aria-modal="true" aria-labelledby="goal-info-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="goal-info-close" onClick={() => setGoalInfoProfileId(null)} aria-label="Erklärung schließen"><X size={22} /></button>
            <span className="goal-info-kicker">DOSB-Bewegungsziel</span>
            <h2 id="goal-info-title">Was zeigt der Kreis?</h2>
            <p className="goal-info-lead">Das Ziel für {goalInfoProfile.name} sind <strong>{goalInfoProfile.targetMinutes} Minuten pro {goalInfoProfile.targetPeriod.toLowerCase()}</strong>.</p>
            <div className="goal-info-legend"><i className="goal-info-ist" /><span><strong>Ist:</strong> bisher erfasste FitFamily-Trainingszeit im aktuellen {goalInfoProfile.targetPeriod.toLowerCase()}.</span></div>
            <div className="goal-info-legend"><i className="goal-info-soll" /><span><strong>Soll:</strong> der vollständige Kreis entspricht dem Ziel. Der graue Ring zeigt den noch offenen Anteil.</span></div>
            <p className="goal-info-note">Ab 100% ist das Ziel erreicht; bei mehr Training zeigt die Prozentzahl auch Werte über 100%. Gezählt werden hier protokollierte FitFamily-Trainings, nicht Schritte oder sonstige Alltagsbewegung. Die Richtwerte orientieren sich an den DOSB-Bewegungsempfehlungen.</p>
            <a className="goal-info-source" href="https://www.dosb.de/ueber-uns/grundlagen-unserer-arbeit/ziele-und-strategie" target="_blank" rel="noreferrer">Zur Quelle beim DOSB ↗</a>
          </section>
        </div>
      )}
    </main>
  );
}
