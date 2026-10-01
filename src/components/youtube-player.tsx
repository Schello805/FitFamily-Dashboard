"use client";

import { useEffect, useRef, useState } from "react";

type PlayerEvent = { data: number };
type Player = { destroy: () => void };
type YoutubeApi = {
  PlayerState: { PLAYING: number };
  Player: new (element: HTMLElement, options: {
    videoId: string;
    playerVars: Record<string, number | string>;
    events: { onStateChange: (event: PlayerEvent) => void };
  }) => Player;
};
type YoutubeWindow = Window & {
  YT?: YoutubeApi;
  onYouTubeIframeAPIReady?: () => void;
  __fitFamilyYoutubeApi?: Promise<YoutubeApi>;
};

function loadYoutubeApi(): Promise<YoutubeApi> {
  const host = window as YoutubeWindow;
  if (host.YT?.Player) return Promise.resolve(host.YT);
  if (host.__fitFamilyYoutubeApi) return host.__fitFamilyYoutubeApi;

  host.__fitFamilyYoutubeApi = new Promise((resolve, reject) => {
    const previousReady = host.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => reject(new Error("YouTube-Player konnte nicht geladen werden.")), 15000);
    host.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      window.clearTimeout(timeout);
      if (host.YT?.Player) resolve(host.YT);
      else reject(new Error("YouTube-Player ist nicht verfügbar."));
    };
    if (!document.querySelector("script[data-fitfamily-youtube-api]")) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.dataset.fitfamilyYoutubeApi = "true";
      script.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("YouTube-Player konnte nicht geladen werden."));
      };
      document.head.appendChild(script);
    }
  });
  return host.__fitFamilyYoutubeApi;
}

export function YoutubePlayer({ videoId, title, onPlayingChange }: { videoId: string; title: string; onPlayingChange: (playing: boolean) => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let disposed = false;
    let player: Player | null = null;
    void loadYoutubeApi().then((api) => {
      if (disposed || !mountRef.current) return;
      player = new api.Player(mountRef.current, {
        videoId,
        playerVars: { playsinline: 1, rel: 0, origin: window.location.origin },
        events: { onStateChange: (event) => onPlayingChange(event.data === api.PlayerState.PLAYING) }
      });
    }).catch(() => {
      if (!disposed) setUnavailable(true);
    });
    return () => {
      disposed = true;
      player?.destroy();
      onPlayingChange(false);
    };
  }, [videoId, onPlayingChange]);

  if (unavailable) {
    return <p className="plan-no-video">Das eingebettete Video konnte nicht geladen werden. Prüfe die Internetverbindung.</p>;
  }
  return <div className="plan-exercise-video" aria-label={title}><div ref={mountRef} title={title} /></div>;
}
