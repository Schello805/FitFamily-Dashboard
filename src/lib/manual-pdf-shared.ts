export const MAX_MANUAL_PDF_BYTES = 10 * 1024 * 1024;
export const MAX_MANUAL_PDF_BASE64 = Math.ceil(MAX_MANUAL_PDF_BYTES / 3) * 4;
export type ManualPdfUpload = { name: string; data: string };

export function equipmentManualUrl(id: string) {
  return `/api/equipment/${encodeURIComponent(id)}/manual`;
}

export function isStoredManualUrl(value: string) {
  return /^\/api\/equipment\/[^/?#]+\/manual$/.test(value);
}

export function isManualPdfUrl(value: string) {
  if (isStoredManualUrl(value)) return true;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}
