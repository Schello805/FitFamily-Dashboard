import { NextResponse } from "next/server";
import { z } from "zod";
import { getDisplaySettings, setDisplaySettings } from "@/lib/display-settings";
import { adminPinSchema, verifyAdminPinOrReject } from "@/lib/security";
import { CLOCK_TIME_PATTERN, validTimeZone } from "@/lib/display-time";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getDisplaySettings();
  return NextResponse.json({ ok: true, settings });
}

const postSchema = z.object({
  preparationSeconds: z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(30), z.literal(60)]).optional(),
  pin: adminPinSchema,
  timeZone: z.string().refine(validTimeZone).optional(),
  idleTimeoutMinutes: z.number().int().min(0).max(180).optional(),
  nightModeEnabled: z.boolean().optional(),
  nightIdleTimeoutMinutes: z.number().int().min(0).max(120).optional(),
  nightStartTime: z.string().regex(CLOCK_TIME_PATTERN).optional(),
  nightEndTime: z.string().regex(CLOCK_TIME_PATTERN).optional()
});

export async function POST(request: Request) {
  const body = postSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Ungültige Eingabedaten." }, { status: 400 });
  }

  const pinError = await verifyAdminPinOrReject(body.data.pin, request);
  if (pinError) return pinError;

  const updated = await setDisplaySettings({
    preparationSeconds: body.data.preparationSeconds,
    timeZone: body.data.timeZone,
    idleTimeoutMinutes: body.data.idleTimeoutMinutes,
    nightModeEnabled: body.data.nightModeEnabled,
    nightIdleTimeoutMinutes: body.data.nightIdleTimeoutMinutes,
    nightStartTime: body.data.nightStartTime,
    nightEndTime: body.data.nightEndTime
  });

  return NextResponse.json({ ok: true, settings: updated });
}
