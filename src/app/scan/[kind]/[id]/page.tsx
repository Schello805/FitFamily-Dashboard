import { notFound } from "next/navigation";
import { ScanStart } from "@/components/scan-start";
export default async function ScanPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  if (kind !== "geraet" && kind !== "uebung") notFound();
  return <ScanStart kind={kind} id={id} />;
}
