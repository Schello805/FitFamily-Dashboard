import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { readBoundedJson } from "@/lib/request-body";
import { verifyFamilyHealthKey } from "@/lib/health-training-test";
import { healthTrainingSchema, bookHealthTraining } from "@/lib/health-training";
import { writeAdminLog } from "@/lib/admin-log";

export async function POST(request: Request) {
  const token=request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (!await verifyFamilyHealthKey(token)) return NextResponse.json({error:"Familienschlüssel fehlt oder ist ungültig."},{status:401});
  const importId=randomUUID();
  const body=await readBoundedJson(request,64*1024,"Trainingsdaten sind zu groß.");
  if(body instanceof Response) return body;
  const parsed=healthTrainingSchema.safeParse(body);
  if(!parsed.success) {
    const errors=parsed.error.issues.map(i=>`${i.path.join(".")}: ${i.message}`);
    await writeAdminLog("health.training.failed","error","Health-Buchung abgelehnt.",{importId,errors});
    return NextResponse.json({error:"Ungültige Trainingsdaten.",importId,errors},{status:400});
  }
  const result=await bookHealthTraining(parsed.data);
  if(!result) {
    await writeAdminLog("health.training.failed","error","Profil-ID nicht gefunden.",{importId,errors:["Profil-ID mit der Verwaltung vergleichen."]});
    return NextResponse.json({error:"Profil-ID nicht gefunden.",importId},{status:404});
  }
  await writeAdminLog("health.training.received",result.conflicts ? "error":"info","Health-Trainingsbuchung verarbeitet.",{importId,...result});
  return NextResponse.json({importId,...result},{headers:{"Cache-Control":"no-store"}});
}
