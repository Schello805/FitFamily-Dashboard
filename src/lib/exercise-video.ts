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

export function youtubeVideoId(value: string) {
  const validId = (id: string | null | undefined) => id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === "youtu.be") return validId(url.pathname.split("/").filter(Boolean)[0]);
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const queryId = url.searchParams.get("v");
      if (queryId) return validId(queryId);
      const pathMatch = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([a-zA-Z0-9_-]{11})(?:\/|$)/i);
      return pathMatch?.[1] ?? null;
    }
  } catch {}
  return null;
}
