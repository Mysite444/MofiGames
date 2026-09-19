"use client";

import { SORT_OPTIONS, type SortValue } from "@/lib/game-filters";

export function SortIconRow({ value, onChange }: { value: SortValue; onChange: (v: SortValue) => void }) {
  return (
    <div className="hidden gap-3 lg:grid lg:grid-cols-5">
      {SORT_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`lighting-card group flex flex-col items-center gap-2.5 rounded-2xl border px-4 py-5 transition-all duration-200 ${
              active
                ? "border-[var(--color-menu-yellow)] bg-[rgba(0,0,0,0.16)] shadow-[0_6px_22px_rgba(0,0,0,0.28)]"
                : "glass border-white/10 hover:border-white/25"
            }`}
          >
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                active
                  ? "bg-[var(--color-menu-yellow)] text-white"
                  : "bg-white/10 text-white/80 group-hover:bg-white/[0.16]"
              }`}
            >
              <Icon size={23} strokeWidth={2} />
            </span>
            <span className={`text-[13px] font-bold ${active ? "text-white" : "text-text-muted"}`}>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
