"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const subscribe = () => () => {};
const getSlot = () => document.getElementById("dashboard-header-slot");
const getServerSlot = () => null;

// Keep the radio/audio in the root layout; only dashboard header content moves.
export function DashboardHeader({ children }: { children: ReactNode }) {
  const slot = useSyncExternalStore(subscribe, getSlot, getServerSlot);
  const content = <header className="topbar">{children}</header>;
  return slot ? createPortal(content, slot) : content;
}
