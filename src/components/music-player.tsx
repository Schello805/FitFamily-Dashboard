"use client";

import { useEffect, useRef, useState } from "react";
import { ListMusic, Music2, Pause, Play, SkipBack, SkipForward, Upload, Volume2, X } from "lucide-react";

type Track = { id: string; title: string; url: string };

export function MusicPlayer() {
  const [open, setOpen] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(65);
  const [pin, setPin] = useState("");
  const [notice, setNotice] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  async function refreshTracks() {
    const response = await fetch("/api/music", { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      setTracks(data.tracks);
      setCurrentIndex((index) => Math.min(index, Math.max(0, data.tracks.length - 1)));
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/music", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : { tracks: [] })
      .then((data) => { if (active) setTracks(data.tracks); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume / 100; }, [volume]);
  useEffect(() => { if (audioRef.current && tracks[currentIndex]) audioRef.current.load(); }, [currentIndex, tracks]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || tracks.length === 0) return;
    if (audio.paused) {
      try { await audio.play(); setPlaying(true); setNotice(""); }
      catch { setPlaying(false); setNotice("Wiedergabe konnte nicht gestartet werden."); }
    } else { audio.pause(); setPlaying(false); }
  }

  function step(direction: -1 | 1) {
    if (!tracks.length) return;
    setCurrentIndex((index) => (index + direction + tracks.length) % tracks.length);
    setPlaying(true);
    window.setTimeout(() => { void audioRef.current?.play().catch(() => setPlaying(false)); }, 50);
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (pin.length < 4) { setNotice("Für das Hinzufügen von Musik bitte zuerst den Eltern-PIN eingeben."); return; }
    const form = new FormData(); form.set("pin", pin); form.set("file", file);
    const response = await fetch("/api/music", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) { setNotice(data.error ?? "Datei konnte nicht hinzugefügt werden."); return; }
    await refreshTracks(); setNotice("Musik wurde lokal hinzugefügt.");
    input.value = "";
  }

  const current = tracks[currentIndex];
  return <>
    <button className={`music-launch ${playing ? "is-playing" : ""}`} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Musiksteuerung öffnen">
      <Music2 size={20} /><span>{playing ? "Musik läuft" : "Musik"}</span>{playing && <i />}
    </button>
    {open && <section className="music-panel" aria-label="Musikplayer">
      <header><div><Music2 /><span><b>Musik im Sportraum</b><small>{tracks.length ? `${tracks.length} Titel · lokal gespeichert` : "Eigene Musik hinzufügen"}</small></span></div><button onClick={() => setOpen(false)} aria-label="Musiksteuerung schließen"><X /></button></header>
      {tracks.length ? <>
        <div className="music-now"><ListMusic /><div><b>{current?.title ?? "Kein Titel"}</b><small>{playing ? "Wird über die PC-Lautsprecher wiedergegeben" : "Bereit zur Wiedergabe"}</small></div></div>
        <audio ref={audioRef} src={current?.url} onEnded={() => step(1)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} preload="metadata" />
        <div className="music-controls"><button onClick={() => step(-1)} aria-label="Vorheriger Titel"><SkipBack /></button><button className="play-button" onClick={togglePlayback} aria-label={playing ? "Musik pausieren" : "Musik starten"}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button><button onClick={() => step(1)} aria-label="Nächster Titel"><SkipForward /></button></div>
        <label className="volume-control"><Volume2 /><input type="range" min="0" max="100" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /><span>{volume}%</span></label>
        <div className="track-list">{tracks.map((track, index) => <button key={track.id} className={index === currentIndex ? "selected" : ""} onClick={() => { setCurrentIndex(index); setPlaying(true); window.setTimeout(() => { void audioRef.current?.play().catch(() => setPlaying(false)); }, 50); }}><span>{index + 1}</span>{track.title}<Play size={15} /></button>)}</div>
      </> : <div className="music-empty"><Music2 /><b>Noch keine Titel</b><span>Füge eigene MP3-, M4A-, OGG-, WAV- oder FLAC-Dateien hinzu.</span></div>}
      <div className="music-upload"><label>Eltern-PIN<input value={pin} onChange={(event) => setPin(event.target.value)} type="password" inputMode="numeric" placeholder="Für Musik-Upload" /></label><label className="upload-button"><Upload /> Musikdatei hinzufügen<input type="file" accept="audio/*,.flac" onChange={upload} /></label></div>
      {notice && <p className="music-notice">{notice}</p>}
      <p className="music-footnote">Nur Musik verwenden, zu der ihr die nötigen Nutzungsrechte habt.</p>
    </section>}
  </>;
}
