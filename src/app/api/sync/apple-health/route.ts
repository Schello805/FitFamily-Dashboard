import { NextResponse } from "next/server";

// Keep a tombstone for installed shortcuts: no reads, imports, keys or deletion.
function unavailable() {
  return NextResponse.json({ error: "Die Apple-Health-Anbindung wurde eingestellt. Bitte den Kurzbefehl deaktivieren." }, { status: 410, headers: { "Cache-Control": "no-store" } });
}

export const GET = unavailable;
export const POST = unavailable;
export const DELETE = unavailable;
