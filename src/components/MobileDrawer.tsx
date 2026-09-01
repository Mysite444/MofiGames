"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Logo } from "./Logo";
import { NavList } from "./NavList";

export function MobileDrawer({
  open,
  onClose,
  copyrightText,
}: {
  open: boolean;
  onClose: () => void;
  /** Site Identity → Copyright Text (Admin → Site Settings). Pinned to
   * the bottom of the drawer panel, below the scrollable nav list. */
  copyrightText?: string;
}) {
  // The header is `position: sticky` + `backdrop-filter`, which on real
  // mobile Safari/Chrome (NOT desktop DevTools mobile emulation) gets
  // promoted to its own compositing layer that can paint above other
  // `fixed` elements regardless of z-index, if it shares an ancestor
  // stacking context with them. Desktop emulation reuses the desktop
  // compositor, so it never reproduces this — which is why it looks fine
  // in F12 but the drawer stays invisible/behind the header on a real
  // device. Rendering through a portal straight into <body> removes the
  // drawer from that stacking context entirely, so it's no longer at the
  // mercy of the header's compositing layer.
  const [mounted, setMounted] = useState(false);
  // Intentional: this is the standard "wait for client mount before using
  // document.body" guard for SSR-safe portals, not a synchronization bug.
  // Left untouched since this exact logic is what fixed the real-device
  // drawer bug described above.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const drawer = (
    <div
      className={`fixed inset-0 z-[10050] lg:hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* Full-screen panel — same slide-transform mechanism as the previous
          working drawer (kept on its own element, not the outer wrapper). */}
      <div
        className={`absolute inset-0 flex flex-col bg-[var(--color-menu-bg)] transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3.5">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            style={{ touchAction: "manipulation" }}
            className="rounded-full p-1.5 text-text-muted transition-colors active:bg-white/15 active:text-white"
          >
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-2.5 py-4">
            <NavList showArrows onNavigate={onClose} />
          </div>
        </div>

        {copyrightText && (
          <div className="shrink-0 border-t border-white/10 px-4 py-3.5 text-center text-xs leading-snug text-text-faint">
            {copyrightText}
          </div>
        )}
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(drawer, document.body);
}
