"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

const openDialogs: HTMLElement[] = [];
let originalBodyOverflow = "";

function focusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => {
    if (element.closest("[hidden], [inert]")) return false;
    const closedDetails = element.closest("details:not([open])");
    if (closedDetails && !element.closest("summary")) return false;
    let ancestor: HTMLElement | null = element;
    while (ancestor && ancestor !== dialog.parentElement) {
      const style = window.getComputedStyle(ancestor);
      if (style.display === "none" || style.visibility === "hidden") return false;
      ancestor = ancestor.parentElement;
    }
    return true;
  });
}

/** Portal and keyboard behavior for a child with role="dialog". */
export function Modal({ children, onClose, closeDisabled = false, className = "" }: {
  children: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  className?: string;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef({ onClose, closeDisabled });
  useEffect(() => { closeRef.current = { onClose, closeDisabled }; }, [onClose, closeDisabled]);

  // Keyboard handling must be active in the same commit as the visible dialog.
  // This avoids a lost Escape press directly after opening a touch countdown.
  useLayoutEffect(() => {
    const backdrop = backdropRef.current;
    const dialog = backdrop?.querySelector<HTMLElement>('[role="dialog"]');
    if (!backdrop || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = Array.from(document.body.children).filter((element) => element !== backdrop);
    const previousInert = siblings.map((element) => [element, element.hasAttribute("inert")] as const);
    siblings.forEach((element) => element.setAttribute("inert", ""));
    if (openDialogs.length === 0) {
      originalBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openDialogs.push(dialog);
    dialog.tabIndex = -1;
    const focusFirst = () => (focusableElements(dialog)[0] ?? dialog).focus();
    focusFirst();

    const onKeyDown = (event: KeyboardEvent) => {
      if (openDialogs.at(-1) !== dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!closeRef.current.closeDisabled) closeRef.current.onClose();
      } else if (event.key === "Tab") {
        const elements = focusableElements(dialog);
        const first = elements[0];
        const last = elements.at(-1);
        if (!first || !last) {
          event.preventDefault();
          dialog.focus();
        } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const onFocusIn = (event: FocusEvent) => {
      if (openDialogs.at(-1) === dialog && !dialog.contains(event.target as Node)) focusFirst();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
      openDialogs.splice(openDialogs.indexOf(dialog), 1);
      previousInert.forEach(([element, wasInert]) => { if (!wasInert) element.removeAttribute("inert"); });
      if (openDialogs.length === 0) document.body.style.overflow = originalBodyOverflow;
      if (previousFocus?.isConnected && !previousFocus.closest("[inert]")) previousFocus.focus();
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={backdropRef} className={`modal-backdrop ${className}`.trim()} onClick={(event) => {
      if (event.target === event.currentTarget && !closeDisabled) onClose();
    }}>{children}</div>,
    document.body
  );
}
