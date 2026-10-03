import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createEquipment, GET as listEquipment } from "./route";
import { PATCH as updateEquipment } from "./[id]/route";
import { GET as openManual } from "./[id]/manual/route";
import { POST as exportData } from "../export/route";
import { POST as importData } from "../admin/data/route";
import { db } from "@/lib/db";
import { setAdminPin } from "@/lib/security";
import { MAX_MANUAL_PDF_BYTES } from "@/lib/manual-pdf-shared";
import { readBoundedJson } from "@/lib/request-body";

const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
const upload = { name: "Geräteanleitung.pdf", data: pdf.toString("base64") };
function request(body: object, method = "POST") {
  return new Request("http://localhost/api/equipment", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: "7349", ...body }) });
}
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const manualRequest = new Request("http://localhost/api/equipment/test/manual");

describe("server-stored PDF manuals", () => {
  let previousPin: string | null;
  const created: string[] = [];
  beforeAll(async () => {
    const result = await (await db()).execute("SELECT value FROM settings WHERE key = 'admin_pin_hash'");
    previousPin = result.rows[0] ? String(result.rows[0].value) : null;
    await setAdminPin("7349");
  });
  afterAll(async () => {
    const client = await db();
    for (const id of created) await client.execute({ sql: "DELETE FROM equipment_inventory WHERE id = ?", args: [id] });
    if (previousPin) await client.execute({ sql: "UPDATE settings SET value = ? WHERE key = 'admin_pin_hash'", args: [previousPin] });
    else await client.execute("DELETE FROM settings WHERE key = 'admin_pin_hash'");
    await client.execute("DELETE FROM admin_login_attempts");
  });

  it("creates, opens, preserves, replaces and removes PDFs without including their content in equipment lists", async () => {
    const response = await createEquipment(request({ name: "PDF-Testgerät", quantity: 1, manualPdfUpload: upload }));
    expect(response.status).toBe(201);
    const { equipment } = await response.json();
    created.push(equipment.id);
    const read = () => openManual(manualRequest, context(equipment.id));
    const stored = await read();
    expect(stored.headers.get("Content-Type")).toBe("application/pdf");
    expect(stored.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(Buffer.from(await stored.arrayBuffer())).toEqual(pdf);
    const list = await (await listEquipment(new Request("http://localhost/api/equipment"))).text();
    expect(list).not.toContain(upload.data);

    const patch = (extra: object) => updateEquipment(request({ name: equipment.name, quantity: 2, available: true, manualPdfUrl: equipment.manualPdfUrl, ...extra }, "PATCH"), context(equipment.id));
    expect((await patch({})).status).toBe(200);
    expect(Buffer.from(await (await read()).arrayBuffer())).toEqual(pdf);
    expect((await patch({ manualPdfUpload: { ...upload, data: Buffer.from("not a PDF").toString("base64") } })).status).toBe(400);
    expect(Buffer.from(await (await read()).arrayBuffer())).toEqual(pdf);
    expect((await patch({ manualPdfUrl: "/api/equipment/another-device/manual" })).status).toBe(400);
    const replacement = Buffer.from("%PDF-1.7\nReplacement\n%%EOF\n");
    expect((await patch({ manualPdfUpload: { name: "Neu.pdf", data: replacement.toString("base64") } })).status).toBe(200);
    expect(Buffer.from(await (await read()).arrayBuffer())).toEqual(replacement);
    expect((await patch({ manualPdfUrl: null })).status).toBe(200);
    expect((await read()).status).toBe(404);
    const row = (await (await db()).execute({ sql: "SELECT manual_pdf_data, manual_pdf_name FROM equipment_inventory WHERE id = ?", args: [equipment.id] })).rows[0];
    expect(row.manual_pdf_data).toBeNull();
    expect(row.manual_pdf_name).toBeNull();
  });

  it("round-trips PDF bytes and relative links through export and restore, while accepting older exports", async () => {
    const response = await createEquipment(request({ name: "PDF-Exportgerät", quantity: 1, manualPdfUpload: upload }));
    const { equipment } = await response.json();
    created.push(equipment.id);
    const exported = await (await exportData(request({}))).json();
    const row = exported.data.equipment_inventory.find((entry: { id: string }) => entry.id === equipment.id);
    expect(row.manual_pdf_data).toBe(upload.data);
    const bundle = { format: "fitfamily-export", version: 1, data: { profiles: [], equipment_inventory: [row] } };
    await (await db()).execute({ sql: "UPDATE equipment_inventory SET manual_pdf_url = NULL, manual_pdf_data = NULL, manual_pdf_name = NULL WHERE id = ?", args: [equipment.id] });
    const imported = await importData(request({ action: "import", backup: bundle }));
    expect(await imported.json()).toMatchObject({ ok: true });
    expect(Buffer.from(await (await openManual(manualRequest, context(equipment.id))).arrayBuffer())).toEqual(pdf);
    const oldBundle = { ...bundle, data: { profiles: [], equipment_inventory: [{ id: equipment.id, name: equipment.name, quantity: 1 }] } };
    expect((await importData(request({ action: "import", backup: oldBundle }))).status).toBe(200);
    expect(Buffer.from(await (await openManual(manualRequest, context(equipment.id))).arrayBuffer())).toEqual(pdf);
    expect(await (await importData(request({ action: "validate", backup: { ...bundle, data: { ...bundle.data, equipment_inventory: [{ ...row, manual_pdf_data: null }] } } }))).json()).toMatchObject({ valid: false });
  });

  it("rejects unauthenticated, oversized and non-PDF uploads", async () => {
    expect((await createEquipment(request({ pin: "", name: "Not authorized", quantity: 1, manualPdfUpload: upload }))).status).toBe(401);
    expect((await createEquipment(request({ name: "Not a PDF", quantity: 1, manualPdfUpload: { name: "fake.pdf", data: "aGVsbG8=" } }))).status).toBe(400);
    const oversized = new Request("http://localhost/api/equipment", { method: "POST", headers: { "Content-Length": String(MAX_MANUAL_PDF_BYTES * 2) }, body: "{}" });
    expect((await createEquipment(oversized)).status).toBe(413);
    const streamed = new Request("http://localhost/api/equipment", { method: "POST", body: "123456789" });
    expect((await readBoundedJson(streamed, 8, "Too large") as Response).status).toBe(413);
  });
});
