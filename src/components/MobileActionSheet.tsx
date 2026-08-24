"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Same portal-to-body approach as MobileDrawer, for the same reason: a
// sticky + backdrop-blur header can paint above a `fixed` sheet on real
// mobile Safari/Chrome if they share a stacking context. Portaling straight
// into <body> sidesteps that entirely.
export function MobileActionSheet({
  open,
  onClose,
  title,
  icon,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const sheet = (
    <div
      className={`fixed inset-0 z-[10050] lg:hidden ${open ? "pointer-events-auto" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col gap-4 rounded-t-2xl bg-[var(--color-menu-bg)] p-5 pb-7 ring-1 ring-white/10 transition-transform duration-300 ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="glass flex h-9 w-9 items-center justify-center rounded-full text-white">
              {icon}
            </span>
            <h2 className="font-display text-base font-bold text-white">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ touchAction: "manipulation" }}
            className="rounded-full p-1.5 text-text-muted transition-colors active:bg-white/15 active:text-white"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
