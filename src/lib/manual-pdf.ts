import { z } from "zod";
import { readBoundedJson } from "./request-body";
import { MAX_MANUAL_PDF_BASE64, MAX_MANUAL_PDF_BYTES, isManualPdfUrl } from "./manual-pdf-shared";

export function validPdfData(value: string) {
  if (!value || value.length > MAX_MANUAL_PDF_BASE64) return false;
  const bytes = Buffer.from(value, "base64");
  return bytes.length <= MAX_MANUAL_PDF_BYTES && bytes.toString("base64") === value
    && /^%PDF-\d\.\d/.test(bytes.subarray(0, 8).toString("ascii"))
    && bytes.subarray(-1024).includes(Buffer.from("%%EOF"));
}

export const manualPdfUrlSchema = z.string().max(1000).refine(isManualPdfUrl).nullable().optional();
export const manualPdfDataSchema = z.string().max(MAX_MANUAL_PDF_BASE64).refine(validPdfData, "Bitte eine gültige PDF-Datei bis 10 MiB auswählen.");
export const manualPdfUploadSchema = z.object({
  name: z.string().min(1).max(200).regex(/\.pdf$/i).transform(name => name.split(/[\\/]/).at(-1)!.replace(/[\x00-\x1f\x7f]/g, "")),
  data: manualPdfDataSchema
}).optional();

export async function readEquipmentBody(request: Request): Promise<unknown | Response> {
  return readBoundedJson(request, MAX_MANUAL_PDF_BASE64 + 32_768, "Die PDF-Datei darf höchstens 10 MiB groß sein.");
}
