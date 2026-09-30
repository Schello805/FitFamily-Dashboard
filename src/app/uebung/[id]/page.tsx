import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, Wind } from "lucide-react";
import { getExerciseGuide } from "@/lib/exercise-guides";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ExercisePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ profil?: string }> }) {
  const { id } = await params; const { profil } = await searchParams; const guide = getExerciseGuide(id);
  if (!guide) notFound();
  const client = await db();
  const media = await client.execute({ sql: "SELECT video_url FROM exercises WHERE id = ?", args: [id] });
  const videoUrl = media.rows[0]?.video_url ? String(media.rows[0].video_url) : null;
  const videoSearch = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${guide.name} ${guide.equipment} richtige Ausführung`)}`;
  return <main className="guide-page"><header><Link href={profil ? `/profil/${profil}` : "/"}><ArrowLeft /> Zurück</Link><div><span>{guide.equipment}</span><h1>{guide.name}</h1></div></header><section className="guide-hero"><div><span className="setup-badge">Technik vor Tempo</span><h2>Sauber. Kontrolliert.<br />Sicher.</h2></div><div className="tempo"><Wind /><span><b>Atmung</b>{guide.breathing}</span><span><b>Tempo</b>{guide.tempo}</span></div></section><section className="guide-grid"><article><h3>1. Vorbereitung</h3>{guide.setup.map((step) => <p key={step}><CheckCircle2 />{step}</p>)}</article><article><h3>2. Bewegung</h3>{guide.movement.map((step) => <p key={step}><CheckCircle2 />{step}</p>)}</article><article className="warning"><h3>Häufige Fehler</h3>{guide.mistakes.map((step) => <p key={step}><AlertTriangle />{step}</p>)}</article><article className="warning safety"><h3>Sicherheit</h3>{guide.safety.map((step) => <p key={step}><AlertTriangle />{step}</p>)}</article></section><section className="guide-video"><div><span className="section-kicker">Optionales Video</span><h2>{videoUrl ? "Eure Videoanleitung" : "Videoanleitung suchen"}</h2><p>Videos werden nicht eingebettet. Erst beim Öffnen wird YouTube aufgerufen.</p></div><a href={videoUrl ?? videoSearch} target="_blank" rel="noreferrer"><ExternalLink />{videoUrl ? "Video auf YouTube öffnen" : "Passende Videos auf YouTube ansehen"}</a></section></main>;
}
