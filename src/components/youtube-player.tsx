"use client";

import { useEffect, useRef, useState } from "react";

type PlayerEvent = { data: number };
type PlayerErrorEvent = { data: number };
type Player = { destroy: () => void };
type YoutubeApi = {
  PlayerState: { PLAYING: number };
  Player: new (element: HTMLElement, options: {
    playerVars: Record<string, number | string>;
    events: { onStateChange: (event: PlayerEvent) => void; onError: (event: PlayerErrorEvent) => void };
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

  const apiPromise = new Promise<YoutubeApi>((resolve, reject) => {
    const previousReady = host.onYouTubeIframeAPIReady;
    const fail = () => {
      window.clearTimeout(timeout);
      const script = document.querySelector<HTMLScriptElement>("script[data-fitfamily-youtube-api]");
      if (script && !host.YT?.Player) script.remove();
      if (host.__fitFamilyYoutubeApi === apiPromise) delete host.__fitFamilyYoutubeApi;
      reject(new Error("YouTube-Steuerung konnte nicht geladen werden."));
    };
    const timeout = window.setTimeout(fail, 15000);
    host.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      try { previousReady?.(); } catch {}
      if (host.YT?.Player) resolve(host.YT);
      else fail();
    };
    if (!document.querySelector("script[data-fitfamily-youtube-api]")) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.dataset.fitfamilyYoutubeApi = "true";
      script.onerror = fail;
      document.head.appendChild(script);
    }
  });
  host.__fitFamilyYoutubeApi = apiPromise;
  return apiPromise;
}

export function YoutubePlayer({ videoId, title, onPlayingChange }: { videoId: string; title: string; onPlayingChange: (playing: boolean) => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?enablejsapi=1&playsinline=1&rel=0&autoplay=1&origin=${encodeURIComponent(origin)}`;
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

  useEffect(() => {
    let disposed = false;
    let player: Player | null = null;
    // The iframe loads immediately; its larger control API loads alongside it.
    void loadYoutubeApi().then((api) => {
      if (disposed || !iframeRef.current) return;
      player = new api.Player(iframeRef.current, {
        playerVars: { playsinline: 1, rel: 0, origin: window.location.origin },
        events: {
          onStateChange: (event) => onPlayingChange(event.data === api.PlayerState.PLAYING),
          onError: () => { setBlocked(true); onPlayingChange(false); }
        }
      });
    }).catch(() => {
      if (!disposed) {
        setApiUnavailable(true);
        // Without playback state, keep the unit open rather than interrupt a video.
        onPlayingChange(true);
      }
    });
    return () => {
      disposed = true;
      player?.destroy();
      onPlayingChange(false);
    };
  }, [videoId, onPlayingChange]);

  return (
    <>
      <div className="plan-exercise-video">
        <iframe
          ref={iframeRef}
          src={embedUrl}
          title={title}
          loading="eager"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      {(apiUnavailable || blocked) && (
        <p className="plan-video-fallback">
          {blocked ? "YouTube erlaubt die Einbettung dieses Videos nicht." : "Die Player-Steuerung ist nicht erreichbar; das eingebettete Video bleibt verfügbar."}{" "}
          <a href={watchUrl} target="_blank" rel="noreferrer">Video direkt bei YouTube öffnen ↗</a>
        </p>
      )}
    </>
  );
}
