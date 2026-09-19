"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import {
  Search,
  X,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Loader2,
  Smartphone,
  Info,
} from "lucide-react";
import {
  fetchAllGamesAdmin,
  fetchMobileMenuGamePins,
  addMobileMenuGame,
  removeMobileMenuGame,
  reorderMobileMenuGames,
  type AdminGame,
  type MobileMenuGamePin,
} from "@/lib/supabase/admin-content";

// Soft visual hint — the scroll rail fits ~6 portrait cards on most phones.
const RECOMMENDED_MAX = 12;

export function MobileFeaturedAdminClient() {
  const [allGames, setAllGames] = useState<AdminGame[] | null>(null);
  const [pins, setPins] = useState<MobileMenuGamePin[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [search, setSearch] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [games, pinRows] = await Promise.all([
        fetchAllGamesAdmin(),
        fetchMobileMenuGamePins(),
      ]);
      setAllGames(games);
      setPins(pinRows);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load data.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Resolve pin rows → full AdminGame objects in pin order.
  const pinnedGames = useMemo<AdminGame[]>(() => {
    if (!allGames || !pins) return [];
    return pins
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((p) => allGames.find((g) => g.id === p.game_id))
      .filter((g): g is AdminGame => Boolean(g));
  }, [allGames, pins]);

  // Published games not already pinned, filtered by search.
  const availableGames = useMemo<AdminGame[]>(() => {
    if (!allGames || !pins) return [];
    const pinnedIds = new Set(pins.map((p) => p.game_id));
    const q = search.trim().toLowerCase();
    return allGames
      .filter((g) => g.is_published && !pinnedIds.has(g.id))
      .filter((g) => (q ? g.title.toLowerCase().includes(q) : true))
      .slice(0, 40);
  }, [allGames, pins, search]);

  // -------------------------------------------------------------------------
  // Add / remove
  // -------------------------------------------------------------------------
  async function handleAdd(game: AdminGame) {
    setBusyId(game.id);
    try {
      await addMobileMenuGame(game.id);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to add game.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(game: AdminGame) {
    setBusyId(game.id);
    try {
      await removeMobileMenuGame(game.id);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to remove game.");
    } finally {
      setBusyId(null);
    }
  }

  // -------------------------------------------------------------------------
  // Reorder — arrow buttons
  // -------------------------------------------------------------------------
  async function move(index: number, direction: -1 | 1) {
    const next = [...pinnedGames];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await persistOrder(next.map((g) => g.id));
  }

  async function persistOrder(orderedIds: string[]) {
    setSavingOrder(true);
    try {
      await reorderMobileMenuGames(orderedIds);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to save order.");
    } finally {
      setSavingOrder(false);
    }
  }

  // -------------------------------------------------------------------------
  // Reorder — drag and drop
  // -------------------------------------------------------------------------
  function handleDragOver(e: DragEvent, id: string) {
    e.preventDefault();
    if (dragId && id !== dragId && id !== dragOverId) setDragOverId(id);
  }

  function handleDrop(dropId: string) {
    if (!dragId || dragId === dropId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const ids = pinnedGames.map((g) => g.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(dropId);
    setDragId(null);
    setDragOverId(null);
    if (from === -1 || to === -1) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    persistOrder(next);
  }

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  const loading = allGames === null || pins === null;

  return (
    <div>
      {/* Info banner -------------------------------------------------------- */}
      <div className="mb-6 flex items-start gap-3 rounded-xl bg-white/5 px-4 py-3.5">
        <Smartphone size={18} className="mt-0.5 shrink-0 text-text-faint" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Mobile hamburger menu — Featured Games row</p>
          <p className="mt-1 text-xs leading-relaxed text-text-faint">
            Games you add here appear in the portrait-card scroll row at the top of the mobile
            drawer. Drag or use the arrows to reorder them. Aim for{" "}
            <span className="font-semibold text-white/80">6–8 games</span> for the best fit on
            small screens — the row scrolls, so more is fine, just less discoverable.
          </p>
          <p className="mt-1.5 text-xs text-text-faint">
            <Info size={11} className="mr-1 inline-block" />
            If this list is empty the drawer falls back to a built-in selection automatically — no
            action required until you want custom games here.
          </p>
        </div>
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="glass flex items-center justify-center rounded-xl py-16 text-text-faint">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* ----------------------------------------------------------------
              LEFT — current pinned list
          ----------------------------------------------------------------- */}
          <div className="glass rounded-xl p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-bold text-white">
                  Featured Games in mobile menu
                  {pinnedGames.length > 0 && (
                    <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-xs font-normal text-text-faint">
                      {pinnedGames.length}
                    </span>
                  )}
                </h2>
                <p className="mt-0.5 text-xs text-text-faint">
                  Drag rows or use arrows to reorder. Changes save immediately.
                </p>
              </div>
              {savingOrder && (
                <Loader2 size={14} className="shrink-0 animate-spin text-text-faint" />
              )}
            </div>

            {/* Over-count soft warning */}
            {pinnedGames.length > RECOMMENDED_MAX && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                <Info size={13} className="shrink-0" />
                {pinnedGames.length} games pinned — consider trimming to {RECOMMENDED_MAX} or fewer
                for the best mobile experience.
              </div>
            )}

            {pinnedGames.length === 0 ? (
              <div className="rounded-lg bg-white/5 px-3 py-8 text-center">
                <p className="text-xs text-text-faint">
                  No games pinned yet — the mobile menu will show the default built-in selection.
                </p>
                <p className="mt-1 text-xs text-text-faint">
                  Add published games from the list on the right to override it.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {pinnedGames.map((game, i) => (
                  <li
                    key={game.id}
                    draggable
                    onDragStart={() => setDragId(game.id)}
                    onDragOver={(e) => handleDragOver(e, game.id)}
                    onDrop={() => handleDrop(game.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setDragOverId(null);
                    }}
                    className={[
                      "flex items-center gap-2.5 rounded-lg bg-white/5 px-2.5 py-2 transition-colors",
                      dragId === game.id ? "opacity-40" : "",
                      dragOverId === game.id && dragId && dragId !== game.id
                        ? "ring-2 ring-inset ring-white/50"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {/* Drag handle */}
                    <span className="cursor-grab shrink-0 text-text-faint active:cursor-grabbing">
                      <GripVertical size={15} />
                    </span>

                    {/* Arrow reorder */}
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
                        disabled={i === pinnedGames.length - 1 || savingOrder}
                        className="text-text-faint hover:text-white disabled:opacity-25"
                        aria-label="Move down"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>

                    {/* Position badge */}
                    <span className="shrink-0 w-5 text-center text-[10px] font-bold text-text-faint">
                      {i + 1}
                    </span>

                    {/* Thumbnail */}
                    {game.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={game.thumbnail_url}
                        alt=""
                        className="h-10 w-[26px] shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="h-10 w-[26px] shrink-0 rounded-md bg-white/10" />
                    )}

                    {/* Title + category */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{game.title}</p>
                      <p className="truncate text-[11px] text-text-faint">{game.category_slug}</p>
                    </div>

                    {/* Remove */}
                    <button
                      type="button"
                      onClick={() => handleRemove(game)}
                      disabled={busyId === game.id}
                      className="shrink-0 rounded-full p-1.5 text-text-faint hover:bg-white/10 hover:text-hot disabled:opacity-40"
                      aria-label={`Remove ${game.title}`}
                    >
                      {busyId === game.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <X size={14} />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ----------------------------------------------------------------
              RIGHT — search & add published games
          ----------------------------------------------------------------- */}
          <div className="glass rounded-xl p-4">
            <h2 className="mb-3 font-display text-sm font-bold text-white">Add a game</h2>

            {/* Search */}
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
              <Search size={15} className="shrink-0 text-text-faint" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search published games by title…"
                className="w-full bg-transparent text-sm text-white placeholder:text-text-faint focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="shrink-0 text-text-faint hover:text-white"
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {availableGames.length === 0 ? (
              <p className="rounded-lg bg-white/5 px-3 py-6 text-center text-xs text-text-faint">
                {search
                  ? "No published games match that search."
                  : "Every published game is already in the mobile menu."}
              </p>
            ) : (
              <ul className="flex max-h-[520px] flex-col gap-1.5 overflow-y-auto pr-0.5">
                {availableGames.map((game) => (
                  <li
                    key={game.id}
                    className="flex items-center gap-2.5 rounded-lg bg-white/5 px-2.5 py-2"
                  >
                    {game.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={game.thumbnail_url}
                        alt=""
                        className="h-10 w-[26px] shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="h-10 w-[26px] shrink-0 rounded-md bg-white/10" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{game.title}</p>
                      <p className="truncate text-[11px] text-text-faint">{game.category_slug}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAdd(game)}
                      disabled={busyId === game.id}
                      className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-40"
                    >
                      {busyId === game.id ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        "Add"
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
