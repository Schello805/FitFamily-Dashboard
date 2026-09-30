"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Info, Sparkles, X } from "lucide-react";

export type ToastType = "success" | "info" | "error" | "sparkles";

export type ToastOptions = {
  type?: ToastType;
  title: string;
  message?: string;
  durationMs?: number;
};

type ToastItem = ToastOptions & {
  id: string;
  type: ToastType;
};

const TOAST_EVENT = "fitfamily:toast";

export function showToast(options: ToastOptions | string) {
  if (typeof window === "undefined") return;
  const payload: ToastOptions = typeof options === "string" ? { title: options } : options;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: payload }));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleToast = (event: Event) => {
      const customEvent = event as CustomEvent<ToastOptions>;
      const detail = customEvent.detail;
      if (!detail?.title) return;

      const item: ToastItem = {
        id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: detail.type ?? "info",
        title: detail.title,
        message: detail.message,
        durationMs: detail.durationMs ?? 4000
      };

      setToasts((prev) => [...prev.slice(-3), item]);

      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, item.durationMs);

      return () => clearTimeout(timer);
    };

    window.addEventListener(TOAST_EVENT, handleToast);
    return () => window.removeEventListener(TOAST_EVENT, handleToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-viewport" role="status" aria-live="polite">
      {toasts.map((toast) => {
        return (
          <div key={toast.id} className={`toast-card toast-${toast.type}`}>
            <div className="toast-icon">
              {toast.type === "success" && <CheckCircle2 size={22} />}
              {toast.type === "error" && <AlertCircle size={22} />}
              {toast.type === "sparkles" && <Sparkles size={22} />}
              {toast.type === "info" && <Info size={22} />}
            </div>
            <div className="toast-content">
              <b>{toast.title}</b>
              {toast.message && <p>{toast.message}</p>}
            </div>
            <button
              type="button"
              className="toast-close"
              aria-label="Schließen"
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
