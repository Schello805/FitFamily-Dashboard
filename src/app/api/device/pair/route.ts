import { NextResponse } from "next/server";
import { z } from "zod";
import { pairDevice, requestUsesHttps, verifyAdminPinOrReject } from "@/lib/security";

const schema = z.object({ profileId: z.string().min(1), pin: z.string().regex(/^\d{4}$/), label: z.string().max(60).nullable().optional() });

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Eingaben unvollständig" }, { status: 400 });
  const pinError = await verifyAdminPinOrReject(body.data.pin, request);
  if (pinError) return pinError;
  if (!requestUsesHttps(request) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Die dauerhafte Geräteverbindung benötigt HTTPS. Öffne FitFamily über die eingerichtete HTTPS-Adresse; über HTTP wird kein Gerät gekoppelt." }, { status: 409 });
  }
  const token = await pairDevice(body.data.profileId, body.data.label ?? null);
  const response = NextResponse.json({ ok: true });
  response.cookies.set("ff_device", token, { httpOnly: true, sameSite: "strict", secure: requestUsesHttps(request), maxAge: 60 * 60 * 24 * 365 * 2, path: "/" });
  return response;
}
