import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { mergeAllCategoriesWithDb } from "@/lib/categories";
import { getAllRealGames, getAllRealCategories } from "@/lib/games-server";
import { iconMap } from "@/lib/icon-map";
import type { Category } from "@/lib/types";

export const metadata = {
  title: "All Categories — MofiGames",
  description: "Browse every game genre on MofiGames.",
};

export default async function CategoriesPage() {
  const [realGames, realCategories] = await Promise.all([getAllRealGames(), getAllRealCategories()]);

  // DB values overwrite static fields (name, icon, colors, SEO …) for the
  // 18 built-in genres; custom DB-only categories are appended at the end.
  const allCategories: Category[] = mergeAllCategoriesWithDb(realCategories);

  function countFor(slug: string): number {
    return realGames.filter((g) => g.categorySlug === slug).length;
  }

  const Header = (
    <section
      className="relative overflow-hidden rounded-2xl p-6 sm:p-8"
      style={{ background: "linear-gradient(120deg, #1e1b4b, #4f46e5)" }}
    >
      <LayoutGrid
        size={180}
        strokeWidth={1}
        className="pointer-events-none absolute -right-6 -top-8 text-white/15"
        aria-hidden
      />
      <div className="relative flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
          <LayoutGrid size={24} color="#fff" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">
            All Categories
          </h1>
          <p className="text-sm text-white/80">Browse every game genre on MofiGames</p>
        </div>
      </div>
      <p className="relative mt-4 text-xs font-semibold text-white/70">
        {allCategories.length} genres to explore
      </p>
    </section>
  );

  return (
    <>
      {/* Mobile / iOS / Android */}
      <div className="flex flex-col gap-5 lg:hidden">
        <div className="px-4">{Header}</div>
        <div className="flex flex-col gap-3 px-4">
          {allCategories.map((cat) => {
            const Icon = iconMap[cat.icon];
            const count = countFor(cat.slug);
            return (
              <Link
                key={cat.slug}
                href={`/${cat.slug}`}
                className="group relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 ring-1 ring-white/10 transition-all hover:ring-white"
                style={{ background: `linear-gradient(120deg, ${cat.colorTo}cc, ${cat.colorFrom}99)` }}
              >
                <Icon
                  size={100}
                  strokeWidth={1}
                  className="pointer-events-none absolute -right-4 -top-4 text-white/10"
                  aria-hidden
                />
                <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                  <Icon size={22} color="#fff" />
                </span>
                <div className="relative min-w-0 flex-1">
                  <p className="font-display text-base font-bold text-white">{cat.name}</p>
                  <p className="text-xs text-white/70">{cat.description}</p>
                </div>
                <span className="relative shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white/80">
                  {count}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Desktop / laptop */}
      <div className="hidden flex-col gap-6 px-4 md:px-6 lg:flex">
        {Header}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {allCategories.map((cat) => {
            const Icon = iconMap[cat.icon];
            const count = countFor(cat.slug);
            return (
              <Link
                key={cat.slug}
                href={`/${cat.slug}`}
                className="group relative overflow-hidden rounded-2xl p-5 ring-1 ring-white/10 transition-all hover:-translate-y-1 hover:ring-white hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                style={{ background: `linear-gradient(135deg, ${cat.colorTo}dd, ${cat.colorFrom}bb)` }}
              >
                <Icon
                  size={120}
                  strokeWidth={1}
                  className="pointer-events-none absolute -right-5 -top-5 text-white/10"
                  aria-hidden
                />
                <div className="relative flex items-start justify-between gap-2">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                    <Icon size={22} color="#fff" />
                  </span>
                  <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white/80">
                    {count} games
                  </span>
                </div>
                <div className="relative mt-4">
                  <p className="font-display text-lg font-bold text-white">{cat.name}</p>
                  <p className="mt-0.5 text-xs text-white/70">{cat.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
