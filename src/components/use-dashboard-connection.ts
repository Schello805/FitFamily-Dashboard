"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DashboardProfile } from "@/lib/domain";
import type { DisplaySettings } from "@/lib/display-settings-shared";
import { requestJson } from "@/lib/api-client";

type DashboardData = { profiles: DashboardProfile[]; displaySettings?: DisplaySettings };

export function useDashboardConnection(onData: (data: DashboardData) => void) {
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const onDataRef = useRef(onData);
  const pendingRef = useRef<Promise<boolean> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  useEffect(() => { onDataRef.current = onData; }, [onData]);

  const refresh = useCallback((force = false): Promise<boolean> => {
    if (force) {
      abortRef.current?.abort();
      abortRef.current = null;
      pendingRef.current = null;
    }
    if (pendingRef.current) return pendingRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    const request = (async () => {
      try {
        const data = await requestJson<DashboardData>("/api/dashboard", "Dashboard-Daten konnten nicht aktualisiert werden.", {
          cache: "no-store", signal: controller.signal
        });
        if (!mountedRef.current || abortRef.current !== controller) return false;
        onDataRef.current(data);
        setLastRefreshedAt(Date.now());
        setConnectionError(false);
        return true;
      } catch {
        if (mountedRef.current && abortRef.current === controller) setConnectionError(true);
        return false;
      } finally {
        window.clearTimeout(timeout);
        if (abortRef.current === controller) {
          pendingRef.current = null;
          abortRef.current = null;
        }
      }
    })();
    pendingRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    const offline = () => setConnectionError(true);
    const online = () => { void refresh(); };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
      abortRef.current?.abort();
      abortRef.current = null;
      pendingRef.current = null;
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, [refresh]);

  return { refresh, lastRefreshedAt, connectionError };
}
