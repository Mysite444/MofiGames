"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import {
  Search,
  X,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Loader2,
  Sparkles,
  Star,
  Megaphone,
  Zap,
  Rows3,
  Smartphone,
} from "lucide-react";
import {
  fetchAllGamesAdmin,
  updateGame,
  reorderHomepageSection,
  type AdminGame,
  type HomepageSection,
} from "@/lib/supabase/admin-content";
import { HomepageCategoriesManager } from "./HomepageCategoriesManager";
import { MobileFeaturedAdminClient } from "./MobileFeaturedAdminClient";

type TabKey = "editors_pick" | "featured" | "sponsored" | "automatic" | "categories" | "mobile_menu";

const SECTION_CONFIG: Record<
  Exclude<TabKey, "automatic" | "categories" | "mobile_menu">,
  {
    label: string;
    description: string;
    flagKey: "is_editors_pick" | "is_featured" | "is_sponsored";
    orderKey: "editors_pick_order" | "featured_order" | "sponsored_order";
    apiSection: HomepageSection;
    icon: typeof Star;
  }
> = {
  editors_pick: {
    label: "Editor's Picks",
    description: "Hand-picked standouts shown in the Editor's Picks row on the homepage.",
    flagKey: "is_editors_pick",
    orderKey: "editors_pick_order",
    apiSection: "editors_pick",
    icon: Star,
  },
  featured: {
    label: "Featured Collection",
    description: "Shown in the Featured Games row and used for the Top Picks banners on the homepage.",
    flagKey: "is_featured",
    orderKey: "featured_order",
    apiSection: "featured",
    icon: Sparkles,
  },
  sponsored: {
    label: "Sponsored Games",
    description: "Shown in the Sponsored row on the homepage, tagged with a badge on their thumbnail.",
    flagKey: "is_sponsored",
    orderKey: "sponsored_order",
    apiSection: "sponsored",
    icon: Megaphone,
  },
};

export function HomepageAdminClient() {
  const [games, setGames] = useState<AdminGame[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("editors_pick");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const g = await fetchAllGamesAdmin();
      setGames(g);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load games.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const config =
    tab === "automatic" || tab === "categories" || tab === "mobile_menu"
      ? null
      : SECTION_CONFIG[tab];

  const selected = useMemo(() => {
    if (!games || !config) return [];
    return [...games]
      .filter((g) => g[config.flagKey])
      .sort((a, b) => (a[config.orderKey] ?? 9999) - (b[config.orderKey] ?? 9999));
  }, [games, config]);

  const available = useMemo(() => {
    if (!games || !config) return [];
    const q = search.trim().toLowerCase();
    return games
      .filter((g) => !g[config.flagKey])
      .filter((g) => (q ? g.title.toLowerCase().includes(q) : true))
      .slice(0, 30);
  }, [games, config, search]);

  async function handleAdd(game: AdminGame) {
    if (!config) return;
    setBusyId(game.id);
    try {
      await updateGame(game.id, {
        [config.flagKey]: true,
        [config.orderKey]: selected.length,
      } as Partial<AdminGame>);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to add game.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(game: AdminGame) {
    if (!config) return;
    setBusyId(game.id);
    try {
      await updateGame(game.id, {
        [config.flagKey]: false,
        [config.orderKey]: null,
      } as Partial<AdminGame>);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to remove game.");
    } finally {
      setBusyId(null);
    }
  }

  async function persistOrder(orderedIds: string[]) {
    if (!config) return;
    setSavingOrder(true);
    try {
      await reorderHomepageSection(config.apiSection, orderedIds);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to save order.");
    } finally {
      setSavingOrder(false);
    }
  }

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  function move(index: number, direction: -1 | 1) {
    const next = [...selected];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    persistOrder(next.map((g) => g.id));
  }

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
    const ids = selected.map((g) => g.id);
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

  async function handleSponsorLabel(game: AdminGame, label: string) {
    try {
      await updateGame(game.id, { sponsor_label: label.trim() || null });
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to save sponsor label.");
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">Homepage</h1>
        <p className="mt-0.5 text-sm text-text-faint">
          Control what shows up in the Editor&apos;s Picks, Featured, and Sponsored rows, and use the
          Categories tab to rename, reorder, hide, or add games to any row on the homepage.
        </p>
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>
      )}

      <div className="mb-6 flex flex-wrap gap-1.5">
        {(Object.keys(SECTION_CONFIG) as Array<Exclude<TabKey, "automatic" | "categories" | "mobile_menu">>).map((key) => {
          const c = SECTION_CONFIG[key];
          const Icon = c.icon;
          return (
            <TabButton key={key} active={tab === key} onClick={() => setTab(key)}>
              <Icon size={14} />
              {c.label}
            </TabButton>
          );
        })}
        <TabButton active={tab === "automatic"} onClick={() => setTab("automatic")}>
          <Zap size={14} />
          Automatic sections
        </TabButton>
        <TabButton active={tab === "categories"} onClick={() => setTab("categories")}>
          <Rows3 size={14} />
          Categories
        </TabButton>
        <TabButton active={tab === "mobile_menu"} onClick={() => setTab("mobile_menu")}>
          <Smartphone size={14} />
          Mobile Menu
        </TabButton>
      </div>

      {games === null && tab !== "categories" && tab !== "mobile_menu" && (
        <div className="glass flex items-center justify-center rounded-xl py-16 text-text-faint">
          <Loader2 size={20} className="animate-spin" />
        </div>
      )}

      {games !== null && tab === "automatic" && <AutomaticSectionsInfo />}

      {tab === "categories" && <HomepageCategoriesManager />}

      {tab === "mobile_menu" && <MobileFeaturedAdminClient />}

      {games !== null && config && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="glass rounded-xl p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-sm font-bold text-white">{config.label}</h2>
                <p className="mt-0.5 text-xs text-text-faint">{config.description}</p>
              </div>
              {savingOrder && <Loader2 size={14} className="shrink-0 animate-spin text-text-faint" />}
            </div>

            {selected.length === 0 ? (
              <p className="rounded-lg bg-white/5 px-3 py-6 text-center text-xs text-text-faint">
                No games in this collection yet — add some from the list on the right.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {selected.map((game, i) => (
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
                    className={`flex items-center gap-2.5 rounded-lg bg-white/5 px-2.5 py-2 transition-colors ${
                      dragId === game.id ? "opacity-40" : ""
                    } ${
                      dragOverId === game.id && dragId && dragId !== game.id
                        ? "ring-2 ring-inset ring-white/50"
                        : ""
                    }`}
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
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={i === selected.length - 1 || savingOrder}
                        className="text-text-faint hover:text-white disabled:opacity-25"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>

                    {game.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={game.thumbnail_url}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="h-9 w-9 shrink-0 rounded-md bg-white/10" />
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{game.title}</p>
                      {tab === "sponsored" && (
                        <input
                          defaultValue={game.sponsor_label ?? ""}
                          placeholder="Sponsor label (optional)"
                          onBlur={(e) => handleSponsorLabel(game, e.target.value)}
                          className="mt-1 w-full rounded bg-white/10 px-2 py-1 text-xs text-white placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-white/30"
                        />
                      )}
                    </div>

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

          <div className="glass rounded-xl p-4">
            <h2 className="mb-3 font-display text-sm font-bold text-white">Add a game</h2>
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
              <Search size={15} className="shrink-0 text-text-faint" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search games by title…"
                className="w-full bg-transparent text-sm text-white placeholder:text-text-faint focus:outline-none"
              />
            </div>

            {available.length === 0 ? (
              <p className="rounded-lg bg-white/5 px-3 py-6 text-center text-xs text-text-faint">
                {search ? "No games match that search." : "Every game is already in this collection."}
              </p>
            ) : (
              <ul className="flex max-h-[480px] flex-col gap-1.5 overflow-y-auto">
                {available.map((game) => (
                  <li
                    key={game.id}
                    className="flex items-center gap-2.5 rounded-lg bg-white/5 px-2.5 py-2"
                  >
                    {game.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={game.thumbnail_url}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="h-9 w-9 shrink-0 rounded-md bg-white/10" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{game.title}</p>
                      <p className="truncate text-xs text-text-faint">{game.category_slug}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAdd(game)}
                      disabled={busyId === game.id}
                      className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-40"
                    >
                      {busyId === game.id ? <Loader2 size={13} className="animate-spin" /> : "Add"}
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

function AutomaticSectionsInfo() {
  const rows = [
    {
      title: "New Games",
      body: "Newest published games first. No manual setup — a game shows up here as soon as it's published.",
    },
    {
      title: "Can't Stop Playing (Trending)",
      body: "Every published game ranked purely by play count. Climbs and falls on its own as plays come in.",
    },
    {
      title: "Recently Updated",
      body: "Games tagged UPDATED, set on the game's edit form in Games, most recently updated first.",
    },
  ];
  return (
    <div className="glass rounded-xl p-4">
      <p className="mb-4 text-xs text-text-faint">
        These homepage rows need no setup here — they're driven automatically by when a game was added, its
        tag, or its play count.
      </p>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.title} className="rounded-lg bg-white/5 p-3">
            <p className="text-sm font-semibold text-white">{r.title}</p>
            <p className="mt-1 text-xs text-text-faint">{r.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
        active ? "bg-white text-black" : "glass text-white/70 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
