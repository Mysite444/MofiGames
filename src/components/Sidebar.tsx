"use client";

import { useState } from "react";
import { NavList } from "./NavList";

export function Sidebar({
  hidden,
  copyrightText,
}: {
  hidden: boolean;
  /** Site Identity → Copyright Text (Admin → Site Settings). Pinned to
   * the bottom of the sidebar, only while it's expanded — the collapsed
   * 60px icon-rail has no room to show it without wrapping/clipping. */
  copyrightText?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const expanded = hovered && !hidden;

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`fixed top-14 left-0 z-20 hidden h-[calc(100vh-3.5rem)] flex-col overflow-hidden border-r border-white/10 bg-[var(--color-menu-bg)] backdrop-blur-xl transition-all duration-200 lg:flex ${
        hidden ? "-translate-x-full opacity-0" : "translate-x-0 opacity-100"
      } ${expanded ? "w-[252px] shadow-[0_0_40px_rgba(0,0,0,0.7)]" : "w-[60px]"}`}
    >
      {/* Overlay, not push — main never shifts when this expands (see
          AppShell). Horizontal/vertical padding here is INTENTIONALLY the
          same in both states (only the scrollbar-revealing class toggles) —
          NavList's icons sit at a fixed px-3 offset from this container's
          left edge, so any padding change here would itself reintroduce
          the "icon jumps sideways on hover" bug this is fixing. */}
      <div
        className={`menu-scroll flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-2 ${
          hovered ? "menu-scroll-open" : ""
        }`}
      >
        <NavList collapsed={!hovered} />
      </div>

      {copyrightText && expanded && (
        <div className="shrink-0 border-t border-white/10 px-3.5 py-3 text-center text-[11px] leading-snug text-text-faint">
          {copyrightText}
        </div>
      )}
    </aside>
  );
}
