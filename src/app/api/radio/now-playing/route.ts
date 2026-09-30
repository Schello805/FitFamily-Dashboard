import { NextResponse } from "next/server";
import { getRadioStation } from "@/lib/radio";

export const dynamic = "force-dynamic";

function parseIcyTitle(metadata: string) {
  const match = metadata.match(/StreamTitle='((?:\\.|[^'])*)';/);
  return match?.[1]?.replace(/\\'/g, "'").replace(/\\\\/g, "\\").trim() || null;
}

export async function GET(request: Request) {
  const stationId = new URL(request.url).searchParams.get("station") ?? "";
  const station = getRadioStation(stationId);
  if (!station) return NextResponse.json({ title: null }, { status: 404 });

  try {
    const upstream = await fetch(station.streamUrl, {
      headers: { "Icy-MetaData": "1", Range: "bytes=0-65535" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store"
    });
    if (!upstream.ok || !upstream.body) return NextResponse.json({ title: null });

    const interval = Number(upstream.headers.get("icy-metaint"));
    if (!Number.isFinite(interval) || interval <= 0) {
      await upstream.body.cancel();
      return NextResponse.json({ title: null });
    }

    const reader = upstream.body.getReader();
    let received = 0;
    let metadataLength: number | null = null;
    const metadataChunks: Uint8Array[] = [];
    let metadataReceived = 0;

    while (received < interval + 1 || metadataLength === null || metadataReceived < metadataLength) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      let offset = 0;

      if (received < interval) {
        const audioBytesNeeded = interval - received;
        const audioBytes = Math.min(audioBytesNeeded, value.length);
        received += audioBytes;
        offset += audioBytes;
      }

      if (received === interval && metadataLength === null && offset < value.length) {
        metadataLength = value[offset] * 16;
        offset += 1;
        received += 1;
        if (metadataLength === 0) break;
      }

      if (metadataLength !== null && metadataReceived < metadataLength && offset < value.length) {
        const take = Math.min(metadataLength - metadataReceived, value.length - offset);
        metadataChunks.push(value.slice(offset, offset + take));
        metadataReceived += take;
      }
    }

    await reader.cancel();
    if (!metadataChunks.length) return NextResponse.json({ title: null });
    const metadataBytes = new Uint8Array(metadataReceived);
    let position = 0;
    for (const chunk of metadataChunks) {
      metadataBytes.set(chunk, position);
      position += chunk.length;
    }
    const metadata = new TextDecoder().decode(metadataBytes).replace(/\0+$/, "");
    return NextResponse.json({ title: parseIcyTitle(metadata) });
  } catch {
    return NextResponse.json({ title: null });
  }
}
