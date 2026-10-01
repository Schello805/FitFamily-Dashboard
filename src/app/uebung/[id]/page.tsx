import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, PlayCircle, Video, Wind } from "lucide-react";
import { getExerciseGuide } from "@/lib/exercise-guides";
import { db } from "@/lib/db";
import { ExerciseStartButton } from "@/components/exercise-start-button";
import { KioskIdleBar } from "@/components/kiosk-idle-bar";

export const dynamic = "force-dynamic";

function parseVideoEmbed(url: string | null) {
  if (!url) return null;
  const trimmed = url.trim();

  // YouTube Links (youtube.com/watch, embed, shorts, youtu.be)
  const ytMatch = trimmed.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
  if (ytMatch && ytMatch[1]) {
    return {
      type: "youtube" as const,
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?rel=0&modestbranding=1&playsinline=1`,
      watchUrl: `https://www.youtube.com/watch?v=${ytMatch[1]}`
    };
  }

  // YouTube bare 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return {
      type: "youtube" as const,
      embedUrl: `https://www.youtube-nocookie.com/embed/${trimmed}?rel=0&modestbranding=1&playsinline=1`,
      watchUrl: `https://www.youtube.com/watch?v=${trimmed}`
    };
  }

  // Direkte Videodatei
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(trimmed)) {
    return {
      type: "html5" as const,
      src: trimmed
    };
  }

  // Anderer Link
  return {
    type: "external" as const,
    url: trimmed
  };
}

export default async function ExercisePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ profil?: string; fromPlan?: string }>;
}) {
  const { id } = await params;
  const { profil, fromPlan } = await searchParams;
  const guide = getExerciseGuide(id);

  const client = await db();

  // 1. Suche nach Video direkt auf dieser Übung
  let media = await client.execute({
    sql: "SELECT video_url, type FROM exercises WHERE id = ? AND video_url IS NOT NULL AND TRIM(video_url) != ''",
    args: [id]
  });
  let videoUrl = media.rows[0]?.video_url ? String(media.rows[0].video_url).trim() : null;
  let rawType = media.rows[0]?.type ? String(media.rows[0].type) : null;

  // 2. Suche nach Video über aufgelöste Guide-ID
  if (!videoUrl && guide.id !== id) {
    media = await client.execute({
      sql: "SELECT video_url, type FROM exercises WHERE id = ? AND video_url IS NOT NULL AND TRIM(video_url) != ''",
      args: [guide.id]
    });
    videoUrl = media.rows[0]?.video_url ? String(media.rows[0].video_url).trim() : null;
    if (!rawType && media.rows[0]?.type) rawType = String(media.rows[0].type);
  }

  // 3. Suche nach Video auf dem zugehörigen Gerät (equipment_inventory)
  if (!videoUrl) {
    const equipRes = await client.execute({
      sql: "SELECT video_url FROM equipment_inventory WHERE (name = ? OR id = ? OR LOWER(name) = LOWER(?)) AND video_url IS NOT NULL AND TRIM(video_url) != '' LIMIT 1",
      args: [guide.equipment, guide.equipment.toLowerCase(), guide.equipment]
    });
    videoUrl = equipRes.rows[0]?.video_url ? String(equipRes.rows[0].video_url).trim() : null;
  }

  // 4. Fallback: Suche nach Video irgendeiner Übung auf demselben Gerät
  if (!videoUrl) {
    const siblingRes = await client.execute({
      sql: "SELECT video_url FROM exercises WHERE equipment = ? AND video_url IS NOT NULL AND TRIM(video_url) != '' LIMIT 1",
      args: [guide.equipment]
    });
    videoUrl = siblingRes.rows[0]?.video_url ? String(siblingRes.rows[0].video_url).trim() : null;
  }

  const trainingType: "strength" | "endurance" =
    rawType === "endurance" || ["treadmill", "bike", "punchbag", "jump-rope"].includes(guide.id)
      ? "endurance"
      : "strength";

  const video = parseVideoEmbed(videoUrl);
  const videoSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${guide.name} ${guide.equipment} richtige Ausführung Technik`)}`;

  const backHref = fromPlan && profil ? `/profil/${profil}/plan` : profil ? `/profil/${profil}` : "/";
  const backLabel = fromPlan ? "Trainingsplan" : "Zurück";

  return (
    <main className="guide-page">
      <KioskIdleBar redirectUrl={backHref} seconds={120} title={`Übung: ${guide.name}`} />
      <header>
        <Link href={backHref} className="guide-back-link">
          <ArrowLeft size={18} /> {backLabel}
        </Link>
        <div className="guide-header-center">
          <span className="setup-badge">{guide.equipment}</span>
          <h1>{guide.name}</h1>
        </div>
        <div className="guide-header-actions">
          <ExerciseStartButton
            profileId={profil}
            exerciseId={guide.id}
            exerciseName={guide.name}
            type={trainingType}
          />
        </div>
      </header>

      {/* Anleitungsvideo des Geräts / der Übung */}
      {video ? (
        <section className="guide-video-embed-card">
          <div className="guide-video-top">
            <div className="guide-video-badge">
              <PlayCircle size={18} />
              <span>Anleitungsvideo · {guide.equipment}</span>
            </div>
            {video.type === "youtube" && (
              <a href={video.watchUrl} target="_blank" rel="noreferrer" className="guide-video-external-link">
                <Video size={16} /> Auf YouTube öffnen
              </a>
            )}
          </div>
          <div className="guide-video-player-container">
            {video.type === "youtube" ? (
              <iframe
                src={video.embedUrl}
                title={`Anleitungsvideo für ${guide.name}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="guide-video-iframe"
              />
            ) : video.type === "html5" ? (
              <video src={video.src} controls playsInline className="guide-video-html5" />
            ) : (
              <div className="guide-video-link-box">
                <p>Anleitungsvideo für dieses Gerät verlinkt:</p>
                <a href={video.url} target="_blank" rel="noreferrer" className="guide-video-open-btn">
                  <ExternalLink size={16} /> Video ansehen ({video.url})
                </a>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="guide-video-empty-card">
          <div className="guide-video-empty-text">
            <span className="setup-badge">Gerät: {guide.equipment}</span>
            <h3>Noch kein Anleitungsvideo verlinkt</h3>
            <p>
              In den <b>Einstellungen (Verwaltung)</b> kannst du eine YouTube-Anleitung für die <b>{guide.equipment}</b> oder speziell für <b>{guide.name}</b> hinterlegen. Sie wird dann hier direkt abgespielt.
            </p>
          </div>
          <div className="guide-video-empty-actions">
            <Link href="/verwaltung" className="guide-btn-settings">
              In Einstellungen verlinken
            </Link>
            <a href={videoSearch} target="_blank" rel="noreferrer" className="guide-btn-yt">
              <ExternalLink size={15} /> Auf YouTube suchen
            </a>
          </div>
        </section>
      )}

      {/* Hero mit Atmung & Tempo */}
      <section className="guide-hero">
        <div>
          <span className="setup-badge">Technik vor Tempo</span>
          <h2>Sauber. Kontrolliert.<br />Sicher.</h2>
        </div>
        <div className="tempo">
          <Wind />
          <span><b>Atmung</b>{guide.breathing}</span>
          <span><b>Tempo</b>{guide.tempo}</span>
        </div>
      </section>

      {/* Detaillierte Schritt-für-Schritt-Anleitung */}
      <section className="guide-grid">
        <article>
          <h3>1. Vorbereitung</h3>
          {guide.setup.map((step) => (
            <p key={step}><CheckCircle2 />{step}</p>
          ))}
        </article>
        <article>
          <h3>2. Bewegung</h3>
          {guide.movement.map((step) => (
            <p key={step}><CheckCircle2 />{step}</p>
          ))}
        </article>
        <article className="warning">
          <h3>Häufige Fehler</h3>
          {guide.mistakes.map((step) => (
            <p key={step}><AlertTriangle />{step}</p>
          ))}
        </article>
        <article className="warning safety">
          <h3>Sicherheit</h3>
          {guide.safety.map((step) => (
            <p key={step}><AlertTriangle />{step}</p>
          ))}
        </article>
      </section>
    </main>
  );
}
