"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Search, X, LayoutGrid, Tag, Monitor, Users, RotateCcw, SearchX, Gamepad2, SlidersHorizontal,
} from "lucide-react";
import { useMergedGames } from "@/lib/games-merged";
import { iconMap } from "@/lib/icon-map";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CategoryPageHeading } from "@/components/CategoryPageHeading";
import { FilterDropdown } from "@/components/games/FilterDropdown";
import { FilterChips } from "@/components/games/FilterChips";
import { SortIconRow } from "@/components/games/SortIconRow";
import { MobileFilterSheet } from "@/components/games/MobileFilterSheet";
import { BrowseGameGrid } from "@/components/games/BrowseGameGrid";
import {
  DEFAULT_FILTERS,
  filterGames,
  sortGames,
  filtersFromSearchParams,
  filtersToSearchParams,
  readStoredFilters,
  writeStoredFilters,
  TAG_FILTER_OPTIONS,
  PLATFORM_OPTIONS,
  GAME_MODE_OPTIONS,
  type GameFilters,
  type TagFilterValue,
  type Platform,
  type GameMode,
} from "@/lib/game-filters";

export function GamesBrowseClient() {
  const searchParamsRaw = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const { games: allGames, categories: allCategories } = useMergedGames();

  const [filters, setFilters] = useState<GameFilters>(DEFAULT_FILTERS);
  const [hydrated, setHydrated] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // ── Initial state: an explicit URL wins outright (shareable links must
  // render exactly what they encode); otherwise fall back to whatever
  // filters were last remembered in localStorage. Runs once on mount only —
  // subsequent URL changes are ones *this* component itself writes (see the
  // sync effect below), so re-reading them here would just fight that.
  useEffect(() => {
    const params = new URLSearchParams(searchParamsRaw.toString());
    const fromUrl = filtersFromSearchParams(params);
    const hasUrlSignal =
      fromUrl.q.trim().length > 0 ||
      fromUrl.categories.length > 0 ||
      fromUrl.tags.length > 0 ||
      fromUrl.platforms.length > 0 ||
      fromUrl.modes.length > 0 ||
      fromUrl.sort !== "popular";

    if (hasUrlSignal) {
      setFilters(fromUrl);
    } else {
      const stored = readStoredFilters();
      if (stored) setFilters((f) => ({ ...f, ...stored }));
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Keep the URL + localStorage in sync with the live filter state,
  // debounced so fast typing/toggling doesn't flood browser history or
  // write to storage on every keystroke.
  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      const qs = filtersToSearchParams(filters).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      writeStoredFilters(filters);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [filters, hydrated, pathname, router]);

  // ── Debounced search-analytics logging — same fire-and-forget pattern as
  // the header SearchBox, so query volume/quality shows up in Admin →
  // Analytics regardless of which search box someone used.
  useEffect(() => {
    const q = filters.q.trim();
    if (q.length < 2) return;
    const timeout = window.setTimeout(() => {
      fetch("/api/analytics/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q.toLowerCase(), resultsCount: sorted.length }),
      }).catch(() => {});
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 700);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q]);

  const filtered = useMemo(() => filterGames(allGames, filters), [allGames, filters]);
  const sorted = useMemo(() => sortGames(filtered, filters.sort), [filtered, filters.sort]);

  const categoryOptions = useMemo(
    () => allCategories.map((c) => ({ value: c.slug, label: c.name, icon: iconMap[c.icon] })),
    [allCategories]
  );

  const activeFilterCount =
    filters.categories.length + filters.tags.length + filters.platforms.length + filters.modes.length;

  function resetFilters() {
    setFilters((f) => ({ ...DEFAULT_FILTERS, sort: f.sort }));
  }

  const SearchInput = (
    <div className="glass search-shell flex items-center gap-2.5 rounded-full px-4 py-3">
      <Search size={18} className="shrink-0 text-text-faint" />
      <input
        value={filters.q}
        onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        placeholder="Search games by title..."
        aria-label="Search games by title"
        className="w-full bg-transparent text-sm text-text placeholder:text-text-faint focus:outline-none"
      />
      {filters.q.length > 0 && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setFilters({ ...filters, q: "" })}
          className="shrink-0 text-text-faint hover:text-text"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );

  const CountLine = (
    <p className="text-sm font-semibold text-text-faint">
      Showing <span className="text-white">{sorted.length.toLocaleString()}</span> {sorted.length === 1 ? "game" : "games"}
    </p>
  );

  const NoResults = (
    <div className="glass flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
      <SearchX size={34} className="text-text-faint" />
      <p className="font-display text-lg font-bold text-white">No games found</p>
      <p className="max-w-sm text-sm text-text-muted">
        Try a different search term or loosen up your filters — nothing in the library matches this combination
        right now.
      </p>
      <button type="button" onClick={resetFilters} className="btn-cta mt-2 px-5 py-2 text-sm">
        Clear Filters
      </button>
    </div>
  );

  return (
    <>
      {/* ── Mobile / iOS / Android ──────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:hidden">
        <div className="px-4">
          <section
            className="relative overflow-hidden rounded-2xl p-6"
            style={{ background: "linear-gradient(120deg, #2b1750, #7C5CFC)" }}
          >
            <Gamepad2
              size={170}
              strokeWidth={1}
              className="pointer-events-none absolute -right-6 -top-8 text-white/15"
              aria-hidden
            />
            <div className="relative flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                <Gamepad2 size={24} color="#fff" />
              </span>
              <div>
                <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">All Games</h1>
                <p className="text-sm text-white/80">Search and filter the full library</p>
              </div>
            </div>
            <p className="relative mt-4 text-xs font-semibold text-white/70">
              {sorted.length.toLocaleString()} games
            </p>
          </section>
        </div>

        <div className="flex flex-col gap-3 px-4">
          {SearchInput}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileSheetOpen(true)}
              style={{ touchAction: "manipulation" }}
              className="glass-strong flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white"
            >
              <SlidersHorizontal size={16} />
              Filters &amp; Sort
              {activeFilterCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-menu-yellow)] px-1 text-[11px] font-bold leading-none text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {CountLine}
          </div>

          <FilterChips filters={filters} categories={allCategories} onChange={setFilters} onClearAll={resetFilters} />
        </div>

        {sorted.length === 0 ? (
          <div className="px-4">{NoResults}</div>
        ) : (
          <BrowseGameGrid games={sorted} categories={allCategories} variant="mobile" />
        )}

        <MobileFilterSheet
          open={mobileSheetOpen}
          onClose={() => setMobileSheetOpen(false)}
          filters={filters}
          onChange={setFilters}
          categories={allCategories}
          onReset={resetFilters}
          resultCount={sorted.length}
        />
      </div>

      {/* ── Desktop / laptop ────────────────────────────────────────────── */}
      <div className="hidden flex-col gap-5 px-4 md:px-6 lg:flex">
        <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "All Games" }]} />
        <CategoryPageHeading
          title="All Games"
          description="Search and filter the entire MofiGames library — every genre, platform, and mode, all in one place."
        />

        <div className="flex flex-col gap-4">
          {SearchInput}
          <SortIconRow value={filters.sort} onChange={(sort) => setFilters({ ...filters, sort })} />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <FilterDropdown
            label="Category"
            icon={LayoutGrid}
            options={categoryOptions}
            selected={filters.categories}
            onChange={(v) => setFilters({ ...filters, categories: v })}
          />
          <FilterDropdown
            label="Tags"
            icon={Tag}
            options={TAG_FILTER_OPTIONS}
            selected={filters.tags}
            onChange={(v) => setFilters({ ...filters, tags: v as TagFilterValue[] })}
          />
          <FilterDropdown
            label="Platform"
            icon={Monitor}
            options={PLATFORM_OPTIONS}
            selected={filters.platforms}
            onChange={(v) => setFilters({ ...filters, platforms: v as Platform[] })}
          />
          <FilterDropdown
            label="Game Mode"
            icon={Users}
            options={GAME_MODE_OPTIONS}
            selected={filters.modes}
            onChange={(v) => setFilters({ ...filters, modes: v as GameMode[] })}
          />

          {(activeFilterCount > 0 || filters.q.trim().length > 0) && (
            <button
              type="button"
              onClick={resetFilters}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3.5 py-2.5 text-sm font-semibold text-text-muted transition-colors hover:border-white/25 hover:text-white"
            >
              <RotateCcw size={15} strokeWidth={2.25} />
              Reset Filters
            </button>
          )}

          <div className="ml-auto">{CountLine}</div>
        </div>

        <FilterChips filters={filters} categories={allCategories} onChange={setFilters} onClearAll={resetFilters} />

        {sorted.length === 0 ? NoResults : <BrowseGameGrid games={sorted} categories={allCategories} variant="desktop" />}
      </div>
    </>
  );
}
