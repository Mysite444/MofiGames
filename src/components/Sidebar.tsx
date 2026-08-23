"use client";

import { useState } from "react";
import { NavList } from "./NavList";

export function Sidebar({ hidden }: { hidden: boolean }) {
  const [hovered, setHovered] = useState(false);

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`fixed top-14 left-0 z-20 hidden h-[calc(100vh-3.5rem)] flex-col overflow-hidden border-r border-white/10 bg-[var(--color-menu-bg)] backdrop-blur-xl transition-all duration-200 lg:flex ${
        hidden ? "-translate-x-full opacity-0" : "translate-x-0 opacity-100"
      } ${hovered && !hidden ? "w-[252px] shadow-[0_0_40px_rgba(0,0,0,0.7)]" : "w-[60px]"}`}
    >
      <div
        className={`menu-scroll flex-1 overflow-y-auto overflow-x-hidden ${
          hovered ? "menu-scroll-open px-2.5 py-3" : "px-1.5 py-1.5"
        }`}
      >
        <NavList collapsed={!hovered} />
      </div>
    </aside>
  );
}
