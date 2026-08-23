"use client";

import { useSyncExternalStore } from "react";
import { createClient } from "./client";
import { mapDbGameRow, mapDbCategoryRow, type DbGameRow, type DbCategoryRow } from "../games-mapping";
import type { Game, Category } from "../types";

// Client-side counterpart to games-server.ts. Server Components can just
// `await` a Supabase query, but plain client components can't do that
// mid-render — so real games/categories are fetched once into a module-
// level cache here, and every component that needs them subscribes via
// useSyncExternalStore, re-rendering automatically the moment the cache
// populates (usually near-instant — one lightweight query) or updates.
//
// Mobile menu game IDs are fetched in the same round-trip so the
// MobileDrawer never flashes between the static fallback and the
// DB-configured list.

let games: Game[] = [];
let categories: Category[] = [];
let mobilePinIds: string[] = [];
let ready = false;
let loadStarted = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  ensureLoaded();
  return () => listeners.delete(listener);
}

function ensureLoaded() {
  if (loadStarted) return;
  loadStarted = true;

  const supabase = createClient();
  // Base URL of the Vercel Blob store uploaded game builds live in — see
  // NEXT_PUBLIC_BLOB_BASE_URL in .env.example. Only used to turn
  // storage_path back into a playable URL, mirrors blobBaseUrl() in
  // games-server.ts (this is the client-bundle counterpart).
  const gameFilesBaseUrl = process.env.NEXT_PUBLIC_BLOB_BASE_URL!;

  Promise.all([
    supabase
      .from("games")
      .select("*")
      .eq("is_published", true)
      .eq("visibility", "public")
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("*"),
    // Mobile menu pins are publicly readable (RLS policy) — same
    // request batch so MobileDrawer sees the correct list on first render,
    // no separate loading state needed.
    supabase
      .from("mobile_menu_games")
      .select("game_id")
      .order("position", { ascending: true }),
  ]).then(([gamesRes, categoriesRes, mobileRes]) => {
    games = (gamesRes.data ?? []).map((row) => mapDbGameRow(row as DbGameRow, gameFilesBaseUrl));
    categories = (categoriesRes.data ?? []).map((row) => mapDbCategoryRow(row as DbCategoryRow));
    mobilePinIds = (mobileRes.data ?? []).map((r) => r.game_id as string);
    ready = true;
    notify();
  }).catch((err) => {
    // A genuine network failure (Supabase unreachable) rejects the whole
    // Promise.all rather than resolving with a per-query `error` field —
    // without this catch, that becomes an unhandled promise rejection and
    // `ready` never flips to true, so every component using useRealGames
    // (NavList, MobileDrawer, ...) would wait forever instead of settling
    // into a clean "no real games available right now" state. The
    // code-defined categories and static game data elsewhere on the page
    // are unaffected either way — this module only ever holds the
    // DB-backed extras layered on top of them.
    console.error("[real-games-client] Failed to load real games/categories:", err);
    ready = true;
    notify();

    // Without this, a visitor who loads the page during a brief outage
    // would be stuck with an empty games/categories list for the rest of
    // their client-side session (loadStarted is a module-level flag, so
    // plain client-side navigation between pages wouldn't naturally
    // retry) even after Supabase recovers a few seconds later. Retrying
    // once, after a short delay, covers that without hammering a
    // genuinely-down backend — a component can always trigger a fresh
    // attempt sooner by simply remounting/resubscribing before then.
    setTimeout(() => {
      loadStarted = false;
      if (listeners.size > 0) ensureLoaded();
    }, 30_000);
  });
}

function getGamesSnapshot() { return games; }
function getCategoriesSnapshot() { return categories; }
function getMobilePinIdsSnapshot() { return mobilePinIds; }
function getReadySnapshot() { return ready; }

// Stable, module-level constants for the SSR/pre-hydration snapshot.
// useSyncExternalStore compares getServerSnapshot's return value by
// reference on every render; returning new arrays each time trips
// React's "getServerSnapshot should be cached" infinite-loop warning.
const EMPTY_GAMES: Game[] = [];
const EMPTY_CATEGORIES: Category[] = [];
const EMPTY_PINS: string[] = [];
function getServerGamesSnapshot() { return EMPTY_GAMES; }
function getServerCategoriesSnapshot() { return EMPTY_CATEGORIES; }
function getServerMobilePinIdsSnapshot() { return EMPTY_PINS; }
function getServerReadySnapshot() { return false; }

/** Reactive access to real games / categories / mobile-menu pins —
 * re-renders the calling component once the initial fetch completes.
 * `ready` is false only for the brief window before the first load
 * resolves (or if there simply aren't any real games yet).
 * `mobilePinIds` — ordered UUIDs of games pinned in Admin → Homepage →
 * Mobile Menu. Empty array means "fall back to the top real games by
 * plays" — see MobileDrawer.tsx. */
export function useRealGames(): {
  games: Game[];
  categories: Category[];
  mobilePinIds: string[];
  ready: boolean;
} {
  const games = useSyncExternalStore(subscribe, getGamesSnapshot, getServerGamesSnapshot);
  const categories = useSyncExternalStore(subscribe, getCategoriesSnapshot, getServerCategoriesSnapshot);
  const pins = useSyncExternalStore(subscribe, getMobilePinIdsSnapshot, getServerMobilePinIdsSnapshot);
  const readyState = useSyncExternalStore(subscribe, getReadySnapshot, getServerReadySnapshot);
  return { games, categories, mobilePinIds: pins, ready: readyState };
}

/** Non-reactive snapshot — for one-off reads (e.g. inside an event
 * handler) where subscribing to updates isn't needed. */
export function getRealGamesSnapshot(): Game[] {
  ensureLoaded();
  return games;
}
