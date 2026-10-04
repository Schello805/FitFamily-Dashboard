import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { HealthImportView } from "@/components/health-import-view";
export const dynamic = "force-dynamic";
export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await (await db()).execute({ sql: "SELECT name FROM profiles WHERE id=?", args: [id] });
  if (!result.rows.length) notFound();
  return <HealthImportView profileId={id} name={String(result.rows[0].name)} />;
}
