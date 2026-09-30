export function isAllowedVideoUrl(value: string | null) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (
      url.hostname === "youtu.be" ||
      url.hostname === "youtube.com" ||
      url.hostname.endsWith(".youtube.com")
    );
  } catch {
    return false;
  }
}
