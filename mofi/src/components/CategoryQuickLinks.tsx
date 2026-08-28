"use client";

import Link from "next/link";
import { categories } from "@/lib/categories";
import { iconMap } from "@/lib/icon-map";
import { useRealGames } from "@/lib/supabase/real-games-client";

const staticSlugs = new Set(categories.map((c) => c.slug));

// Desktop equivalent of the reference's "Dress Up / Scratch / Shooting..."
// quick-tag grid — uses our real 18 genres instead of made-up tags, reusing
// the same .menu-item "lighting" hover as the sidebar for visual consistency.
export function CategoryQuickLinks() {
  // Real categories added through the admin panel that don't match a
  // placeholder slug get a tile here too, same reasoning as the mobile
  // CategoryQuickGrid — this grid was otherwise the one place on the
  // homepage/404 page a real-only category couldn't be reached from.
  const { categories: realCategories } = useRealGames();
  const newRealCategories = realCategories.filter((c) => !staticSlugs.has(c.slug));
  const allCategories = [...categories, ...newRealCategories];

  return (
    <section className="px-4 md:px-6">
      <div className="glass grid grid-cols-3 gap-2 rounded-2xl p-3 sm:grid-cols-4 md:grid-cols-6">
        {allCategories.map((cat) => {
          const Icon = iconMap[cat.icon];
          return (
            <Link
              key={cat.slug}
              href={`/${cat.slug}`}
              className="menu-item flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-white"
            >
              <Icon size={17} strokeWidth={2} style={{ color: cat.colorFrom }} />
              <span className="truncate">{cat.name}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
