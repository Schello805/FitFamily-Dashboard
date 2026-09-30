"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Headphones, Minus, Music2, Pause, Play, Plus, Radio, Volume2, X } from "lucide-react";
import { RADIO_STATIONS, SPORTS_RADIO_PAGE } from "@/lib/radio";

export function MusicPlayer() {
  const [open, setOpen] = useState(false);
  const [selectedStationId, setSelectedStationId] = useState(RADIO_STATIONS[0].id);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem("fitfamily-radio-volume");
        if (saved !== null) {
          const parsed = Number(saved);
          if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 100) return parsed;
        }
      } catch {
        // ignore
      }
    }
    return 5;
  });
  const [notice, setNotice] = useState("");
  const [trackTitle, setTrackTitle] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const metadataRequestRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const launchButtonRef = useRef<HTMLButtonElement>(null);
  const currentStation = RADIO_STATIONS.find((station) => station.id === selectedStationId) ?? RADIO_STATIONS[0];

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        launchButtonRef.current &&
        !launchButtonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
    try {
      window.localStorage.setItem("fitfamily-radio-volume", String(volume));
    } catch {
      // ignore
    }
  }, [volume]);

  async function playStation(stationId: string) {
    const station = RADIO_STATIONS.find((item) => item.id === stationId);
    const audio = audioRef.current;
    if (!station || !audio) return;
    setNotice("");
    if (selectedStationId === stationId && playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    if (selectedStationId !== stationId || audio.src !== station.streamUrl) {
      setTrackTitle("");
      audio.src = station.streamUrl;
      setSelectedStationId(station.id);
    }
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
      setNotice("Der Sender konnte gerade nicht gestartet werden. Bitte Internetverbindung prüfen und erneut versuchen.");
    }
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    if (!audio.src) audio.src = currentStation.streamUrl;
    try {
      await audio.play();
      setPlaying(true);
      setNotice("");
    } catch {
      setPlaying(false);
      setNotice("Der Sender konnte gerade nicht gestartet werden. Bitte Internetverbindung prüfen und erneut versuchen.");
    }
  }

  useEffect(() => {
    if (!playing) return;
    const controller = new AbortController();
    metadataRequestRef.current?.abort();
    metadataRequestRef.current = controller;

    async function refreshMetadata() {
      try {
        const response = await fetch(`/api/radio/now-playing?station=${encodeURIComponent(currentStation.id)}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { title?: string | null };
        setTrackTitle(data.title?.trim() ?? "");
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") setTrackTitle("");
      }
    }

    void refreshMetadata();
    const interval = window.setInterval(() => void refreshMetadata(), 30_000);
    return () => {
      window.clearInterval(interval);
      controller.abort();
    };
  }, [currentStation.id, playing]);

  function adjustVolume(amount: number) {
    setVolume((current) => Math.max(0, Math.min(100, current + amount)));
  }

  return <>
    <audio ref={audioRef} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => { setPlaying(false); setNotice("Dieser Stream ist momentan nicht erreichbar."); }} preload="none" />
    <button ref={launchButtonRef} className={`music-launch ${playing ? "is-playing" : ""}`} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`Radiosteuerung öffnen${playing ? `, ${currentStation.name}${trackTitle ? `: ${trackTitle}` : ""}` : ""}`}>
      <Music2 size={20} /><span>{playing ? <><b>{currentStation.name}</b><small>{trackTitle || currentStation.description}</small></> : "Radio"}</span>{playing && <i />}
    </button>
    {open && <>
      <div className="music-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
      <section ref={panelRef} className="music-panel" aria-label="Radio-Player">
        <header><div><Radio /><span><b>Radio im Sportraum</b><small>{playing ? `Jetzt läuft · ${currentStation.name}` : "Sender auswählen und starten"}</small></span></div><button onClick={() => setOpen(false)} aria-label="Radiosteuerung schließen"><X /></button></header>
      <div className="radio-now"><Headphones /><div><b>{currentStation.name}</b><small>{playing ? trackTitle || currentStation.description : "Ausgewählt · Senderliste zum Wechseln antippen"}</small></div><button className="play-button" onClick={togglePlayback} aria-label={playing ? "Radio pausieren" : "Radio starten"}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button></div>
      <div className="radio-list" aria-label="Radiosender">
        {RADIO_STATIONS.map((station) => <button key={station.id} className={station.id === selectedStationId ? "selected" : ""} onClick={() => void playStation(station.id)} aria-pressed={station.id === selectedStationId && playing}>
          <span className="radio-list-icon"><Radio /></span><span className="radio-label"><b>{station.name}</b><small>{station.description}</small></span>{station.id === selectedStationId && playing ? <Pause className="radio-state-icon" /> : <Play className="radio-state-icon" />}
        </button>)}
      </div>
      <a className="sports-radio-link" href={SPORTS_RADIO_PAGE} target="_blank" rel="noreferrer"><span><b>Sportschau Live</b><small>Fußball-Audioreportagen an Spieltagen</small></span><ExternalLink /></a>
      <div className="volume-control" role="group" aria-label="Lautstärke einstellen">
        <Volume2 aria-hidden="true" />
        <button className="volume-step" onClick={() => adjustVolume(-5)} aria-label="Lautstärke um 5 Prozent verringern" disabled={volume === 0}><Minus /></button>
        <input id="radio-volume" type="range" min="0" max="100" step="1" value={volume} style={{ "--volume-progress": `${volume}%` } as React.CSSProperties} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Lautstärke" aria-valuetext={`${volume} Prozent`} />
        <button className="volume-step" onClick={() => adjustVolume(5)} aria-label="Lautstärke um 5 Prozent erhöhen" disabled={volume === 100}><Plus /></button>
        <output htmlFor="radio-volume">{volume}%</output>
      </div>
      {notice && <p className="music-notice" role="status">{notice}</p>}
      <p className="music-footnote">Die Sender werden live über das Internet abgespielt. Sportschau-Liveübertragungen gibt es zu ausgewählten Spielen.</p>
    </section></>}
    </>;
}
