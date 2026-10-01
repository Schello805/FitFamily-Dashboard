import { NextResponse } from "next/server";
import { z } from "zod";
import { getDisplaySettings, setDisplaySettings } from "@/lib/display-settings";
import { verifyAdminPin } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getDisplaySettings();
  return NextResponse.json({ ok: true, settings });
}

const postSchema = z.object({
  pin: z.string().min(4),
  idleTimeoutMinutes: z.number().int().min(0).max(120).optional(),
  nightModeEnabled: z.boolean().optional()
});

export async function POST(request: Request) {
  const body = postSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Ungültige Eingabedaten." }, { status: 400 });
  }

  if (!(await verifyAdminPin(body.data.pin))) {
    return NextResponse.json({ error: "Eltern-PIN ist nicht richtig." }, { status: 401 });
  }

  const updated = await setDisplaySettings({
    idleTimeoutMinutes: body.data.idleTimeoutMinutes,
    nightModeEnabled: body.data.nightModeEnabled
  });

  return NextResponse.json({ ok: true, settings: updated });
}
