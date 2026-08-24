"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { Search, X, ChevronUp, ChevronDown, GripVertical, Loader2, Eye, EyeOff, Gamepad2 } from "lucide-react";
import {
  fetchAllGamesAdmin,
  fetchAllCategoriesAdmin,
  fetchHomepageSections,
  fetchHomepageSectionGamePins,
  updateHomepageSection,
  updateCategory,
  reorderHomepageCategories,
  addHomepageSectionGame,
  removeHomepageSectionGame,
  reorderHomepageSectionGames,
  type AdminGame,
  type AdminCategory,
  type HomepageSectionRow,
  type HomepageSectionGamePin,
} from "@/lib/supabase/admin-content";
import { ALL_REGISTRY_SECTIONS, categorySectionKey } from "@/lib/homepage-section-registry";

type RowKind = "system" | "genre" | "category";

interface Row {
  key: string;
  kind: RowKind;
  defaultLabel: string;
  label: string | null;
  position: number;
  isVisible: boolean;
}

const KIND_META: Record<RowKind, { badge: string; hint: string }> = {
  system: {
    badge: "System",
    hint: "Curated row — which games appear automatically is managed in the tabs above. This controls its heading, order, visibility, and any extra pinned games.",
  },
  genre: {
    badge: "Genre",
    hint: "Built-in genre row — shows real games published in this genre; empty until you have some.",
  },
  category: {
    badge: "Category",
    hint: "A category you created in Admin → Categories.",
  },
};

export function HomepageCategoriesManager() {
  const [sections, setSections] = useState<HomepageSectionRow[] | null>(null);
  const [dbCategories, setDbCategories] = useState<AdminCategory[] | null>(null);
  const [pins, setPins] = useState<HomepageSectionGamePin[] | null>(null);
  const [games, setGames] = useState<AdminGame[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [pinSearch, setPinSearch] = useState("");
  const [pinBusyId, setPinBusyId] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [s, c, p, g] = await Promise.all([
        fetchHomepageSections(),
        fetchAllCategoriesAdmin(),
        fetchHomepageSectionGamePins(),
        fetchAllGamesAdmin(),
      ]);
      setSections(s);
      setDbCategories(c);
      setPins(p);
      setGames(g);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load homepage layout.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo<Row[]>(() => {
    if (!sections || !dbCategories) return [];
    const registryRows: Row[] = ALL_REGISTRY_SECTIONS.map((def) => {
      const dbRow = sections.find((s) => s.section_key === def.key);
      return {
        key: def.key,
        kind: def.type as RowKind,
        defaultLabel: def.defaultLabel,
        label: dbRow?.label ?? null,
        position: dbRow?.position ?? def.defaultPosition,
        isVisible: dbRow?.is_visible ?? true,
      };
    });
    const categoryRows: Row[] = dbCategories.map((c) => ({
      key: categorySectionKey(c.slug),
      kind: "category" as const,
      defaultLabel: c.name,
      label: c.homepage_label ?? null,
      // Unset (never customized) categories keep sinking to the very
      // bottom, same as before this manager existed.
      position: c.homepage_position ?? 100000,
      isVisible: c.show_on_homepage,
    }));
    return [...registryRows, ...categoryRows].sort(
      (a, b) => a.position - b.position || a.key.localeCompare(b.key)
    );
  }, [sections, dbCategories]);

  const selectedRow = rows.find((r) => r.key === selectedRowKey) ?? null;

  const pinnedGames = useMemo(() => {
    if (!pins || !games || !selectedRowKey) return [];
    return pins
      .filter((p) => p.section_key === selectedRowKey)
      .sort((a, b) => a.position - b.position)
      .map((p) => games.find((g) => g.id === p.game_id))
      .filter((g): g is AdminGame => Boolean(g));
  }, [pins, games, selectedRowKey]);

  const availableGames = useMemo(() => {
    if (!games || !selectedRowKey) return [];
    const pinnedIds = new Set(pinnedGames.map((g) => g.id));
    const q = pinSearch.trim().toLowerCase();
    return games
      .filter((g) => !pinnedIds.has(g.id))
      .filter((g) => (q ? g.title.toLowerCase().includes(q) : true))
      .slice(0, 30);
  }, [games, selectedRowKey, pinnedGames, pinSearch]);

  async function persistReorder(orderedKeys: string[]) {
    setSavingOrder(true);
    try {
      const kindByKey = new Map(rows.map((r) => [r.key, r.kind]));
      await reorderHomepageCategories(
        orderedKeys.map((key) => ({ key, kind: kindByKey.get(key) ?? "genre" }))
      );
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to save order.");
    } finally {
      setSavingOrder(false);
    }
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...rows];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    persistReorder(next.map((r) => r.key));
  }

  function handleDragOver(e: DragEvent, key: string) {
    e.preventDefault();
    if (dragKey && key !== dragKey && key !== dragOverKey) setDragOverKey(key);
  }

  function handleDrop(dropKey: string) {
    if (!dragKey || dragKey === dropKey) {
      setDragKey(null);
      setDragOverKey(null);
      return;
    }
    const keys = rows.map((r) => r.key);
    const from = keys.indexOf(dragKey);
    const to = keys.indexOf(dropKey);
    setDragKey(null);
    setDragOverKey(null);
    if (from === -1 || to === -1) return;
    const next = [...keys];
    next.splice(from, 1);
    next.splice(to, 0, dragKey);
    persistReorder(next);
  }

  async function handleLabelBlur(row: Row, value: string) {
    const trimmed = value.trim();
    const nextLabel = trimmed === "" ? null : trimmed;
    if (nextLabel === row.label) return;
    setBusyKey(row.key);
    try {
      if (row.kind === "category") {
        const slug = row.key.slice("category:".length);
        await updateCategory(slug, { homepage_label: nextLabel });
      } else {
        await updateHomepageSection(row.key, { label: nextLabel });
      }
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to save heading.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleToggleVisible(row: Row) {
    setBusyKey(row.key);
    try {
      if (row.kind === "category") {
        const slug = row.key.slice("category:".length);
        await updateCategory(slug, { show_on_homepage: !row.isVisible });
      } else {
        await updateHomepageSection(row.key, { is_visible: !row.isVisible });
      }
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to update visibility.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handlePinAdd(game: AdminGame) {
    if (!selectedRowKey) return;
    setPinBusyId(game.id);
    try {
      await addHomepageSectionGame(selectedRowKey, game.id);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to pin game.");
    } finally {
      setPinBusyId(null);
    }
  }

  async function handlePinRemove(game: AdminGame) {
    if (!selectedRowKey) return;
    setPinBusyId(game.id);
    try {
      await removeHomepageSectionGame(selectedRowKey, game.id);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to unpin game.");
    } finally {
      setPinBusyId(null);
    }
  }

  function movePinned(index: number, direction: -1 | 1) {
    if (!selectedRowKey) return;
    const next = [...pinnedGames];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorderHomepageSectionGames(selectedRowKey, next.map((g) => g.id))
      .then(load)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to save order."));
  }

  const loading = sections === null || dbCategories === null || pins === null || games === null;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="max-w-2xl text-xs text-text-faint">
          Every row on the homepage — Featured Games, Sponsored, the built-in genres, and any category
          you&apos;ve created — lives in this one ordered list. Edit a heading, reorder rows, hide one entirely,
          or pin specific games onto any row regardless of their own category.
        </p>
        {savingOrder && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-text-faint">
            <Loader2 size={13} className="animate-spin" /> Saving order…
          </span>
        )}
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>
      )}

      {loading ? (
        <div className="glass flex items-center justify-center rounded-xl py-16 text-text-faint">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : (
        <div className="glass rounded-xl p-4">
          <ul className="flex flex-col gap-1.5">
            {rows.map((row, i) => (
              <li
                key={row.key}
                draggable
                onDragStart={() => setDragKey(row.key)}
                onDragOver={(e) => handleDragOver(e, row.key)}
                onDrop={() => handleDrop(row.key)}
                onDragEnd={() => {
                  setDragKey(null);
                  setDragOverKey(null);
                }}
                className={`flex flex-wrap items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors ${
                  selectedRowKey === row.key ? "bg-white/10 ring-1 ring-inset ring-white/30" : "bg-white/5"
                } ${dragKey === row.key ? "opacity-40" : ""} ${
                  dragOverKey === row.key && dragKey && dragKey !== row.key
                    ? "ring-2 ring-inset ring-white/50"
                    : ""
                } ${!row.isVisible ? "opacity-50" : ""}`}
              >
                <span className="cursor-grab shrink-0 text-text-faint active:cursor-grabbing">
                  <GripVertical size={15} />
                </span>

                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || savingOrder}
                    className="text-text-faint hover:text-white disabled:opacity-25"
                    aria-label="Move up"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === rows.length - 1 || savingOrder}
                    className="text-text-faint hover:text-white disabled:opacity-25"
                    aria-label="Move down"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>

                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-faint">
                  {KIND_META[row.kind].badge}
                </span>

                <div className="min-w-[180px] flex-1">
                  <input
                    key={`${row.key}-${row.label ?? ""}`}
                    defaultValue={row.label ?? ""}
                    placeholder={row.defaultLabel}
                    onBlur={(e) => handleLabelBlur(row, e.target.value)}
                    disabled={busyKey === row.key}
                    className="w-full rounded bg-white/10 px-2.5 py-1.5 text-sm font-semibold text-white placeholder:text-text-faint/70 focus:outline-none focus:ring-1 focus:ring-white/30 disabled:opacity-50"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedRowKey(row.key === selectedRowKey ? null : row.key)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    selectedRowKey === row.key ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  <Gamepad2 size={13} />
                  Games
                </button>

                <button
                  type="button"
                  onClick={() => handleToggleVisible(row)}
                  disabled={busyKey === row.key}
                  className="shrink-0 rounded-full p-1.5 text-text-faint hover:bg-white/10 hover:text-white disabled:opacity-40"
                  aria-label={row.isVisible ? "Hide from homepage" : "Show on homepage"}
                  title={row.isVisible ? "Visible on homepage — click to hide" : "Hidden — click to show"}
                >
                  {busyKey === row.key ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : row.isVisible ? (
                    <Eye size={14} />
                  ) : (
                    <EyeOff size={14} />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedRow && (
        <div className="mt-6">
          <div className="mb-3">
            <h2 className="font-display text-sm font-bold text-white">
              Games pinned to &ldquo;{selectedRow.label || selectedRow.defaultLabel}&rdquo;
            </h2>
            <p className="mt-0.5 text-xs text-text-faint">{KIND_META[selectedRow.kind].hint}</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="glass rounded-xl p-4">
              <h3 className="mb-3 font-display text-sm font-bold text-white">Pinned games</h3>
              {pinnedGames.length === 0 ? (
                <p className="rounded-lg bg-white/5 px-3 py-6 text-center text-xs text-text-faint">
                  No games manually pinned here yet — this row still shows its normal automatic games. Add any
                  game from the list on the right to also show it here.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {pinnedGames.map((game, i) => (
                    <li key={game.id} className="flex items-center gap-2.5 rounded-lg bg-white/5 px-2.5 py-2">
                      <div className="flex flex-col">
                        <button
                          type="button"
                          onClick={() => movePinned(i, -1)}
                          disabled={i === 0}
                          className="text-text-faint hover:text-white disabled:opacity-25"
                          aria-label="Move up"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => movePinned(i, 1)}
                          disabled={i === pinnedGames.length - 1}
                          className="text-text-faint hover:text-white disabled:opacity-25"
                          aria-label="Move down"
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>

                      {game.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={game.thumbnail_url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                      ) : (
                        <div className="h-9 w-9 shrink-0 rounded-md bg-white/10" />
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{game.title}</p>
                        <p className="truncate text-xs text-text-faint">{game.category_slug}</p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handlePinRemove(game)}
                        disabled={pinBusyId === game.id}
                        className="shrink-0 rounded-full p-1.5 text-text-faint hover:bg-white/10 hover:text-hot disabled:opacity-40"
                        aria-label={`Unpin ${game.title}`}
                      >
                        {pinBusyId === game.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="glass rounded-xl p-4">
              <h3 className="mb-3 font-display text-sm font-bold text-white">Add a game</h3>
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                <Search size={15} className="shrink-0 text-text-faint" />
                <input
                  value={pinSearch}
                  onChange={(e) => setPinSearch(e.target.value)}
                  placeholder="Search games by title…"
                  className="w-full bg-transparent text-sm text-white placeholder:text-text-faint focus:outline-none"
                />
              </div>

              {availableGames.length === 0 ? (
                <p className="rounded-lg bg-white/5 px-3 py-6 text-center text-xs text-text-faint">
                  {pinSearch ? "No games match that search." : "Every game is already pinned here."}
                </p>
              ) : (
                <ul className="flex max-h-[480px] flex-col gap-1.5 overflow-y-auto">
                  {availableGames.map((game) => (
                    <li key={game.id} className="flex items-center gap-2.5 rounded-lg bg-white/5 px-2.5 py-2">
                      {game.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={game.thumbnail_url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                      ) : (
                        <div className="h-9 w-9 shrink-0 rounded-md bg-white/10" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{game.title}</p>
                        <p className="truncate text-xs text-text-faint">{game.category_slug}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePinAdd(game)}
                        disabled={pinBusyId === game.id}
                        className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-40"
                      >
                        {pinBusyId === game.id ? <Loader2 size={13} className="animate-spin" /> : "Add"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
