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
  pin: z.string().regex(/^\d{4}$/),
  idleTimeoutMinutes: z.number().int().min(0).max(180).optional(),
  nightModeEnabled: z.boolean().optional(),
  nightIdleTimeoutMinutes: z.number().int().min(0).max(120).optional(),
  nightStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  nightEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional()
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
    nightModeEnabled: body.data.nightModeEnabled,
    nightIdleTimeoutMinutes: body.data.nightIdleTimeoutMinutes,
    nightStartTime: body.data.nightStartTime,
    nightEndTime: body.data.nightEndTime
  });

  return NextResponse.json({ ok: true, settings: updated });
}
