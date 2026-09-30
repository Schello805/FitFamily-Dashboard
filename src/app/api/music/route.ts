import { randomUUID } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { verifyAdminPin } from "@/lib/security";

export const runtime = "nodejs";

const musicDirectory = path.join(process.cwd(), "data", "music");
const allowedExtensions = new Set([".mp3", ".m4a", ".aac", ".ogg", ".wav", ".flac", ".webm"]);
const allowedMimeTypes = new Set(["audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav", "audio/x-wav", "audio/flac", "audio/webm", "application/octet-stream"]);

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

export async function POST(request: Request) {
  const form = await request.formData();
  const pin = form.get("pin");
  const file = form.get("file");
  if (typeof pin !== "string" || !(await verifyAdminPin(pin))) {
    return NextResponse.json({ error: "Eltern-PIN ist nicht richtig" }, { status: 401 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Bitte eine Musikdatei auswählen." }, { status: 400 });
  }
  const extension = path.extname(file.name).toLowerCase();
  if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(file.type || "application/octet-stream")) {
    return NextResponse.json({ error: "Erlaubte Formate: MP3, M4A, AAC, OGG, WAV, FLAC und WEBM." }, { status: 415 });
  }
  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "Eine Musikdatei darf höchstens 50 MB groß sein." }, { status: 413 });
  }

  const originalBase = path.basename(file.name, extension).normalize("NFKC").replace(/[^\p{L}\p{N} ._-]/gu, "").replace(/\s+/g, "-").slice(0, 70) || "Titel";
  const filename = `${originalBase}-${randomUUID().slice(0, 8)}${extension}`;
  await mkdir(musicDirectory, { recursive: true });
  await writeFile(path.join(musicDirectory, filename), Buffer.from(await file.arrayBuffer()), { flag: "wx", mode: 0o600 });
  return NextResponse.json({ track: { id: filename, title: safeDisplayName(filename), url: `/api/music/${encodeURIComponent(filename)}` } }, { status: 201 });
}
