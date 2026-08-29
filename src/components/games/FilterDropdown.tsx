"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface FilterDropdownOption {
  value: string;
  label: string;
  icon?: LucideIcon;
}

export function FilterDropdown({
  label,
  icon: Icon,
  options,
  selected,
  onChange,
}: {
  label: string;
  icon: LucideIcon;
  options: FilterDropdownOption[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  const active = selected.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors ${
          active
            ? "border-[var(--color-menu-yellow)] bg-[rgba(0,0,0,0.16)] text-white"
            : "border-white/10 bg-[var(--color-surface-2)] text-white hover:border-white/25 hover:bg-white/[0.14]"
        }`}
      >
        <Icon size={16} strokeWidth={2.25} />
        {label}
        {active && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-menu-yellow)] px-1 text-[11px] font-bold leading-none text-white">
            {selected.length}
          </span>
        )}
        <ChevronDown size={15} strokeWidth={2.5} className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className="glass-opaque absolute left-0 top-[calc(100%+8px)] z-30 max-h-80 w-56 overflow-y-auto rounded-xl p-1.5"
        >
          {options.map((opt) => {
            const isSelected = selected.includes(opt.value);
            const OptIcon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => toggle(opt.value)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    isSelected
                      ? "border-[var(--color-menu-yellow)] bg-[var(--color-menu-yellow)]"
                      : "border-white/25 bg-transparent"
                  }`}
                >
                  {isSelected && <Check size={11} strokeWidth={3} className="text-white" />}
                </span>
                {OptIcon && <OptIcon size={15} strokeWidth={2} className="shrink-0 text-text-faint" />}
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
