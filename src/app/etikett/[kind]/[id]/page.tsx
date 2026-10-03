import Image from "next/image";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { equipmentScanConfig, scanTarget } from "@/lib/equipment-scan";
import { getMobileReachableBaseUrl } from "@/lib/server-url";
import { PrintLabel } from "@/components/print-label";
export const dynamic = "force-dynamic";
export default async function LabelPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (kind !== "geraet" && kind !== "uebung") notFound();
  const target = kind === "geraet" ? await equipmentScanConfig(id) : await scanTarget(kind, id).catch(() => null);
  if (!target) notFound();
  const h = await headers();
  const request = new Request(`http://${h.get("host") ?? "localhost:3000"}`, { headers: h });
  const url = `${getMobileReachableBaseUrl(request).replace(/\/$/, "")}/scan/${kind}/${encodeURIComponent(id)}`;
  const qr = await QRCode.toDataURL(url, { width: 400, margin: 4, errorCorrectionLevel: "M" });
  return <main className="scan-label-page"><div className="scan-label"><span>FitFamily · Training starten</span><h1>{target.name}</h1><p>{target.type === "strength" ? "Krafttraining" : "Ausdauertraining"}</p><Image src={qr} alt={`QR-Code für ${target.name}`} width={300} height={300} unoptimized /><p>Handy scannen · trainieren · Stopp</p><small>{url}</small></div><PrintLabel /><p className="label-print">Diesen Link als URL auf den NFC-Tag schreiben. NFC und QR starten dieselbe Einheit.</p></main>;
}
