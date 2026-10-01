import { NextResponse } from "next/server";
import { z } from "zod";
import { pairDevice, verifyAdminPin } from "@/lib/security";

const schema = z.object({ profileId: z.string().min(1), pin: z.string().regex(/^\d{4}$/), label: z.string().max(60).nullable().optional() });

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Eingaben unvollständig" }, { status: 400 });
  if (!(await verifyAdminPin(body.data.pin))) return NextResponse.json({ error: "Eltern-PIN ist nicht richtig" }, { status: 401 });
  const token = await pairDevice(body.data.profileId, body.data.label ?? null);
  const response = NextResponse.json({ ok: true });
  response.cookies.set("ff_device", token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 * 2, path: "/" });
  return response;
}
