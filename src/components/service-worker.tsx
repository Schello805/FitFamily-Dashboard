"use client";

import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        reg.update().catch(() => undefined);
      }).catch(() => undefined);
    }
  }, []);
  return null;
}
