import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const musicDirectory = path.join(process.cwd(), "data", "music");
const allowedExtensions = new Set([".mp3", ".m4a", ".aac", ".ogg", ".wav", ".flac", ".webm"]);

function safeDisplayName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Unbekannter Titel";
}

export async function GET() {
  await mkdir(musicDirectory, { recursive: true });
  const names = await readdir(musicDirectory);
  const tracks = names
    .filter((name) => allowedExtensions.has(path.extname(name).toLowerCase()))
    .map((name) => ({ id: name, title: safeDisplayName(name), url: `/api/music/${encodeURIComponent(name)}` }))
    .sort((a, b) => a.title.localeCompare(b.title, "de"));
  return NextResponse.json({ tracks }, { headers: { "Cache-Control": "no-store" } });
}
