"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  addFavoriteRemote,
  addPlaySeconds,
  clearRecentlyPlayedRemote,
  fetchFavoriteSlugs,
  fetchRecentlyPlayedSlugs,
  fetchTotalPlaySeconds,
  incrementPlayCount,
  recordPlayedRemote,
  removeFavoriteRemote,
} from "./supabase/game-activity";

// Client-only "recently played" + "favorites" tracking. Two independent
// ordered lists of game slugs:
//   - recently played: most-recent-first, capped, re-played games jump
//     back to the front instead of duplicating.
//   - favorites: most-recently-favorited-first, uncapped.
// Both are exposed via useSyncExternalStore hooks so every component that
// reads them (homepage rows, the game page heart buttons, the dedicated
// /recently-played and /favorites pages) stays in sync the instant any one
// of them writes — including across browser tabs via the native "storage"
// event.
//
// Signed-out visitors get a localStorage-only experience, same as before.
// Once someone is signed in (including guest/anonymous sessions),
// syncActiveUser() (called by <LibrarySync/> in the root layout) pulls
// their real favorites/recently-played from Supabase and every subsequent
// toggle/record call writes through to it too — so it follows their
// account across devices instead of staying stuck to one browser.

const RECENTLY_PLAYED_KEY = "mofigames:recentlyPlayed";
const FAVORITES_KEY = "mofigames:favorites";
const SEEN_FAVORITES_KEY = "mofigames:favorites:seen";
const MAX_RECENTLY_PLAYED = 24;

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readRaw(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function writeRaw(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage unavailable (private mode, quota, etc.) — fail silently, same
    // policy as the rest of the app's localStorage usage.
  }
}

// In-memory caches so useSyncExternalStore's getSnapshot can return a
// stable reference between renders (it must — returning a freshly-parsed
// array on every call would make React think the store changes on every
// render and loop). Caches are invalidated (set to null) on cross-tab
// "storage" events so the next read picks up the other tab's change.
let recentlyPlayedCache: string[] | null = null;
let favoritesCache: string[] | null = null;
// Slugs the header's bookmark badge has already been "shown" — i.e. the
// favorites list the last time the user opened /favorites from the header.
// Same watermark idea as lib/notifications.ts's lastSeenAt, just keyed by
// slug set instead of timestamp (favorites don't carry a server timestamp
// to compare against). null = not loaded from localStorage yet.
let seenFavoritesCache: string[] | null = null;
const EMPTY: string[] = [];

// The currently signed-in user's id, or null when signed out. Set by
// syncActiveUser() — see <LibrarySync/>. Reads stay local-first (fast,
// works offline); writes fan out to Supabase too when this is set.
let activeUserId: string | null = null;

function getRecentlyPlayedSnapshot(): string[] {
  if (typeof window === "undefined") return EMPTY;
  if (recentlyPlayedCache === null) recentlyPlayedCache = readRaw(RECENTLY_PLAYED_KEY);
  return recentlyPlayedCache;
}

function getFavoritesSnapshot(): string[] {
  if (typeof window === "undefined") return EMPTY;
  if (favoritesCache === null) favoritesCache = readRaw(FAVORITES_KEY);
  return favoritesCache;
}

function getSeenFavoritesSnapshot(): string[] {
  if (typeof window === "undefined") return EMPTY;
  if (seenFavoritesCache === null) seenFavoritesCache = readRaw(SEEN_FAVORITES_KEY);
  return seenFavoritesCache;
}

function getServerSnapshot(): string[] {
  return EMPTY;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === RECENTLY_PLAYED_KEY) recentlyPlayedCache = null;
    if (e.key === FAVORITES_KEY) favoritesCache = null;
    if (e.key === SEEN_FAVORITES_KEY) seenFavoritesCache = null;
    if (e.key === RECENTLY_PLAYED_KEY || e.key === FAVORITES_KEY || e.key === SEEN_FAVORITES_KEY) notify();
  });
}

/** Called by <LibrarySync/> whenever the signed-in user changes. Pulls that
 * account's favorites/recently-played from Supabase and makes them the
 * local source of truth. Signing out just stops writing through to
 * Supabase — it doesn't clear the local snapshot, which reverts to being a
 * plain local-only list until someone signs in again.
 *
 * Note: this replaces local state rather than merging it, so favoriting
 * games while signed out and then logging in won't carry those over yet —
 * a "migrate guest activity into your account" flow is a nice future
 * addition, not something this covers today. */
export function syncActiveUser(userId: string | null) {
  activeUserId = userId;
  if (typeof window === "undefined" || !userId) return;

  fetchFavoriteSlugs(userId).then((slugs) => {
    favoritesCache = slugs;
    writeRaw(FAVORITES_KEY, slugs);
    notify();
  });

  fetchRecentlyPlayedSlugs(userId, MAX_RECENTLY_PLAYED).then((slugs) => {
    recentlyPlayedCache = slugs;
    writeRaw(RECENTLY_PLAYED_KEY, slugs);
    notify();
  });
}

/** Record a game as played — moves it to the front if it's already in the
 * list, dedupes, and caps the list at MAX_RECENTLY_PLAYED. Call this the
 * moment a game actually starts (e.g. the play button is pressed), not
 * just when its page is viewed. */
export function recordPlayed(slug: string) {
  if (typeof window === "undefined" || !slug) return;
  const current = getRecentlyPlayedSnapshot().filter((s) => s !== slug);
  const next = [slug, ...current].slice(0, MAX_RECENTLY_PLAYED);
  recentlyPlayedCache = next;
  writeRaw(RECENTLY_PLAYED_KEY, next);
  notify();
  if (activeUserId) recordPlayedRemote(activeUserId, slug);
  // Play-count tracking is per-game, not per-account, so this fires
  // regardless of sign-in state — a signed-out visitor playing a game
  // still counts toward its total plays.
  incrementPlayCount(slug);
}

// Real seconds reported to the server per heartbeat while a game is
// playing. Kept well under the RPC's per-call cap (see migration 0032) —
// this is the only source of the Profile page's "Hours Played" stat.
const HEARTBEAT_SECONDS = 20;

/** Tracks real elapsed time while a game is actively playing and streams it
 * to the signed-in account in ~20-second increments. Call with the same
 * `playing` boolean that drives the play frame (see GamePlayerPanel /
 * MobileGamePage) — starts ticking the instant it becomes true, flushes
 * and stops the instant it becomes false or the component unmounts.
 *
 * Ticks only count while the tab is actually visible, so leaving a game
 * open in a background tab doesn't rack up play time. Signed-out visitors
 * and any browser with no active account aren't tracked — there's nowhere
 * to persist it — same activeUserId guard `recordPlayed` uses above.
 */
export function usePlayTimeTracking(playing: boolean) {
  useEffect(() => {
    if (!playing || typeof window === "undefined") return;

    let pendingSeconds = 0;

    function flush() {
      if (pendingSeconds <= 0) return;
      const seconds = pendingSeconds;
      pendingSeconds = 0;
      if (activeUserId) addPlaySeconds(seconds);
    }

    function tick() {
      if (document.visibilityState !== "visible") return;
      pendingSeconds += 1;
      if (pendingSeconds >= HEARTBEAT_SECONDS) flush();
    }

    const interval = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(interval);
      flush();
    };
  }, [playing]);
}

export function clearRecentlyPlayed() {
  if (typeof window === "undefined") return;
  recentlyPlayedCache = [];
  writeRaw(RECENTLY_PLAYED_KEY, []);
  notify();
  if (activeUserId) clearRecentlyPlayedRemote(activeUserId);
}

/** Subscribes to the recently-played slug list, most-recent-first. */
export function useRecentlyPlayedSlugs(): string[] {
  return useSyncExternalStore(subscribe, getRecentlyPlayedSnapshot, getServerSnapshot);
}

/** Toggles a game's favorited state and returns the new state. */
export function toggleFavorite(slug: string): boolean {
  if (typeof window === "undefined" || !slug) return false;
  const current = getFavoritesSnapshot();
  const isFavorited = current.includes(slug);
  const next = isFavorited ? current.filter((s) => s !== slug) : [slug, ...current];
  favoritesCache = next;
  writeRaw(FAVORITES_KEY, next);
  notify();
  if (activeUserId) {
    if (isFavorited) removeFavoriteRemote(activeUserId, slug);
    else addFavoriteRemote(activeUserId, slug);
  }
  return !isFavorited;
}

/** Subscribes to the favorited slug list, most-recently-favorited-first. */
export function useFavoriteSlugs(): string[] {
  return useSyncExternalStore(subscribe, getFavoritesSnapshot, getServerSnapshot);
}

/** How many favorited games haven't been "seen" yet — i.e. favorited since
 * the last time the header's bookmark badge was cleared. Drives the badge
 * count on the desktop bookmark icon, mirroring
 * useUnreadNotificationCount()'s relationship to the bell. Unlike the raw
 * favorites total, this returns to 0 once the user opens /favorites and
 * only climbs again as new games get favorited afterward. */
export function useUnreadFavoriteCount(): number {
  const favorites = useFavoriteSlugs();
  const seen = useSyncExternalStore(subscribe, getSeenFavoritesSnapshot, getServerSnapshot);
  const seenSet = new Set(seen);
  return favorites.filter((slug) => !seenSet.has(slug)).length;
}

/** Call when the bookmark badge is clicked/opened — clears the unread
 * badge by recording the current favorites list as "seen". */
export function markFavoritesRead() {
  const current = getFavoritesSnapshot();
  seenFavoritesCache = current;
  writeRaw(SEEN_FAVORITES_KEY, current);
  notify();
}

/** Convenience hook for a single game's heart button. */
export function useIsFavorited(slug: string): boolean {
  const favorites = useFavoriteSlugs();
  return favorites.includes(slug);
}

/** Real total play time for the given account, in seconds — see migration
 * 0032 and usePlayTimeTracking above. Returns null while loading and for
 * signed-out visitors, so the caller can tell "still loading" apart from a
 * genuine 0 (a brand-new account that hasn't played anything yet). This is
 * the only source of the Profile page's "Hours Played" stat. */
export function useTotalPlaySeconds(userId: string | undefined): number | null {
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) {
      setSeconds(null);
      return;
    }
    let cancelled = false;
    setSeconds(null);
    fetchTotalPlaySeconds(userId).then((value) => {
      if (!cancelled) setSeconds(value);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return seconds;
}
