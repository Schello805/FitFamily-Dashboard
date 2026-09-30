import os from "node:os";

/**
 * Ermittelt die echte IPv4-Adresse im lokalen Heimnetzwerk (z. B. 192.168.x.x oder 10.x.x.x).
 * Ignoriert interne Loopback-Adressen (127.0.0.1) und 0.0.0.0.
 */
export function getLanIpAddress(): string | null {
  const interfaces = os.networkInterfaces();
  const candidates: string[] = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      const family = String(iface.family);
      if (
        (family === "IPv4" || family === "4") &&
        !iface.internal &&
        iface.address &&
        iface.address !== "0.0.0.0" &&
        iface.address !== "127.0.0.1"
      ) {
        // Heimnetz-Bereiche bevorzugen: 192.168.x.x, 10.x.x.x, 172.16-31.x.x
        if (
          iface.address.startsWith("192.168.") ||
          iface.address.startsWith("10.") ||
          /^172\.(1[6-9]|2\d|3[0-1])\./.test(iface.address)
        ) {
          return iface.address;
        }
        candidates.push(iface.address);
      }
    }
  }

  return candidates[0] ?? null;
}

/**
 * Liefert eine für Smartphones im Heimnetz erreichbare Basis-URL.
 * Ersetzt 0.0.0.0, 127.0.0.1 und localhost automatisch durch die echte LAN-IP des Servers.
 */
export function getMobileReachableBaseUrl(request?: Request): string {
  const port = process.env.PORT || "3000";

  // 1. Aus der explizit gesetzten APP_URL in .env.local (sofern keine 0.0.0.0 oder localhost)
  const envUrl = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (
    envUrl &&
    !envUrl.includes("0.0.0.0") &&
    !envUrl.includes("localhost") &&
    !envUrl.includes("127.0.0.1")
  ) {
    return envUrl;
  }

  // 2. Aus dem Host-Header des aktuellen Requests (falls der Request schon von einer LAN-IP kam)
  if (request) {
    const hostHeader = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (
      hostHeader &&
      !hostHeader.includes("0.0.0.0") &&
      !hostHeader.includes("localhost") &&
      !hostHeader.includes("127.0.0.1")
    ) {
      const proto = request.headers.get("x-forwarded-proto") ?? "http";
      return `${proto}://${hostHeader}`;
    }
  }

  // 3. Echte LAN-IP der Netzwerkkarte automatisch ermitteln
  const lanIp = getLanIpAddress();
  if (lanIp && lanIp !== "0.0.0.0" && lanIp !== "127.0.0.1") {
    return `http://${lanIp}:${port}`;
  }

  // 4. Notfall-Fallback
  return `http://localhost:${port}`;
}

/**
 * Erstellt eine saubere, für mobile Endgeräte erreichbare Weiterleitungs-URL (niemals 0.0.0.0).
 */
export function createReachableUrl(path: string, request?: Request): URL {
  const base = getMobileReachableBaseUrl(request).replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(`${base}${cleanPath}`);
}
