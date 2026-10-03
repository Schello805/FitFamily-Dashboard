import { db } from "@/lib/db";
import { equipmentManualUrl } from "@/lib/manual-pdf-shared";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await db();
  const result = await client.execute({ sql: "SELECT manual_pdf_data, manual_pdf_name, manual_pdf_url FROM equipment_inventory WHERE id = ?", args: [id] });
  const row = result.rows[0];
  if (!row?.manual_pdf_data || row.manual_pdf_url !== equipmentManualUrl(id)) return Response.json({ error: "PDF-Anleitung nicht gefunden." }, { status: 404 });
  const bytes = Buffer.from(String(row.manual_pdf_data), "base64");
  const filename = encodeURIComponent(String(row.manual_pdf_name || "anleitung.pdf")).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16)}`);
  return new Response(bytes, { headers: {
    "Content-Type": "application/pdf",
    "Content-Length": String(bytes.length),
    "Content-Disposition": `inline; filename="anleitung.pdf"; filename*=UTF-8''${filename}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; frame-ancestors 'self'",
    "Cache-Control": "private, no-store"
  } });
}
