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
  Square,
  Trophy
} from "lucide-react";
import type { DashboardProfile } from "@/lib/domain";
import { LiveDuration } from "@/components/live-duration";
import { avatarAssetForProfile } from "@/lib/domain";

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

function Avatar({ profile }: { profile: DashboardProfile }) {
  const level = Math.max(1, Math.floor(profile.score / 500) + 1);
  return (
    <div className="avatar avatar-generated" style={{ "--profile": profile.color } as React.CSSProperties} aria-label={`Avatar von ${profile.name}`}>
      <Image className="avatar-sprite" src={`/assets/avatars/${avatarAssetForProfile(profile.id, profile.avatar)}.webp`} alt="" width={222} height={444} unoptimized draggable={false} />
      <div className="level-chip">Lvl {level}</div>
    </div>
  );
}

function GoalRing({ value, color, targetMinutes, targetPeriod }: { value: number; color: string; targetMinutes: number; targetPeriod: "Tag" | "Woche" }) {
  return (
    <div className="goal-ring" title={`DOSB-Bewegungsorientierung: ${targetMinutes} Minuten pro ${targetPeriod.toLowerCase()}. Der Ring zählt nur in FitFamily erfasste Trainingszeit, nicht Alltagsbewegung.`} aria-label={`${value} Prozent des Richtwerts von ${targetMinutes} Trainingsminuten pro ${targetPeriod.toLowerCase()}`} style={{ "--progress": `${Math.min(100, value) * 3.6}deg`, "--profile": color } as React.CSSProperties}>
      <span>{value}%</span>
      <small>{targetMinutes}/{targetPeriod === "Tag" ? "Tag" : "Wo."}</small>
    </div>
  );
}

export function Dashboard({ initialProfiles, version }: { initialProfiles: DashboardProfile[]; version: string }) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [weather, setWeather] = useState<Weather>(null);
  const clock = useClock();
  const [quietDismissed, setQuietDismissed] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (response.ok) setProfiles((await response.json()).profiles);
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
  const quietActive = !quietDismissed && (minutesOfDay >= 22 * 60 + 30 || minutesOfDay < 6 * 60 + 30) && !profiles.some((profile) => profile.activeTraining);

  async function stop(event: React.MouseEvent, profileId: string) {
    event.preventDefault();
    event.stopPropagation();
    await fetch("/api/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop", profileId })
    });
    await refresh();
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <section className="brand-block">
          <Image className="brand-logo" src="/assets/fitfamily-logo.png" alt="FitFamily Dashboard – Gesund, aktiv, gemeinsam" width={112} height={112} priority unoptimized />
          <Link className="admin-shortcut" href="/verwaltung" aria-label="Verwaltung öffnen"><Settings size={20} /></Link>
        </section>
        <section className="weather-block" aria-label="Wetter in Bechhofen">
          <CloudSun size={36} />
          <div><strong>{weather ? `${Math.round(weather.temperature)}°` : "–°"}</strong><span>{weather ? weatherLabel(weather.code) : "Wetter lädt"}</span></div>
          <div className="location"><MapPin size={15} /> Bechhofen</div>
        </section>
        <section className="header-actions">
          <div className="clock-block">
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
                <div><span>{profile.activeTraining.exerciseName ?? (profile.activeTraining.type === "strength" ? "Krafttraining" : "Ausdauertraining")}</span><strong><LiveDuration since={profile.activeTraining.segmentStartedAt} /></strong></div>
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
        <a href="https://github.com/Schello805/FitFamily-Dashboard" target="_blank" rel="noreferrer"><GitHubIcon /> GitHub · Rev. {version}</a>
      </footer>
      {quietActive && <button className="quiet-overlay" onClick={() => setQuietDismissed(true)}><span>{clock.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span><strong>Ruhemodus</strong><small>Zum Aufwecken berühren</small></button>}
    </main>
  );
}
