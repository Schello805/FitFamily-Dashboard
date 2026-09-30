import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const mimeTypes: Record<string, string> = {
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg",
  ".wav": "audio/wav", ".flac": "audio/flac", ".webm": "audio/webm"
};

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const filename = path.basename(name);
  if (filename !== name || !mimeTypes[path.extname(filename).toLowerCase()]) return NextResponse.json({ error: "Datei nicht gefunden" }, { status: 404 });
  const filepath = path.join(process.cwd(), "data", "music", filename);
  try {
    const [buffer, fileStats] = await Promise.all([readFile(filepath), stat(filepath)]);
    const range = request.headers.get("range");
    const rangeMatch = range?.match(/^bytes=(\d*)-(\d*)$/);
    if (rangeMatch) {
      const start = rangeMatch[1] ? Number(rangeMatch[1]) : Math.max(0, fileStats.size - Number(rangeMatch[2]));
      const end = rangeMatch[1] && rangeMatch[2] ? Number(rangeMatch[2]) : fileStats.size - 1;
      if (start >= fileStats.size || end < start) {
        return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${fileStats.size}` } });
      }
      const last = Math.min(end, fileStats.size - 1);
      const content = buffer.subarray(start, last + 1);
      return new NextResponse(content, {
        status: 206,
        headers: {
          "Content-Type": mimeTypes[path.extname(filename).toLowerCase()],
          "Content-Length": String(content.length),
          "Content-Range": `bytes ${start}-${last}/${fileStats.size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600"
        }
      });
    }
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": mimeTypes[path.extname(filename).toLowerCase()],
        "Content-Length": String(fileStats.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`
      }
    });
  } catch {
    return NextResponse.json({ error: "Datei nicht gefunden" }, { status: 404 });
  }
}
