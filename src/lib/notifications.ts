"use client";

import { useCallback, useSyncExternalStore } from "react";

// Site-wide notification feed (e.g. "New game added: X") — backed by the
// real `notifications` table via src/app/api/notifications (GET only; rows
// are written server-side whenever an admin publishes a game, see POST
// /api/admin/games — never by a client request). Not tied to an account:
// every visitor sees the same feed, the same way a "what's new" feed on
// any game portal works. "Read" state is therefore tracked locally per
// browser (newest-seen timestamp in localStorage) rather than a per-user
// table, since these are broadcast announcements, not personal messages —
// mirrors the "local-first" spirit of lib/game-library.ts, just without an
// account-sync step since there's nothing personal to sync.

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  thumbnailUrl: string | null;
  createdAt: string; // ISO timestamp
}

interface NotificationDto {
  id: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
}

const LAST_SEEN_KEY = "mofigames:notifications:lastSeenAt";
const EMPTY: AppNotification[] = [];

let cache: AppNotification[] = EMPTY;
let loadState: "idle" | "loading" | "loaded" | "error" = "idle";
let lastSeenAt = 0;
let lastSeenLoaded = false;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function ensureLastSeenLoaded() {
  if (lastSeenLoaded || typeof window === "undefined") return;
  lastSeenLoaded = true;
  const raw = window.localStorage.getItem(LAST_SEEN_KEY);
  lastSeenAt = raw ? Number(raw) || 0 : 0;
}

async function ensureLoaded() {
  if (loadState === "loading" || loadState === "loaded") return;
  loadState = "loading";
  try {
    const res = await fetch("/api/notifications");
    const json = (await res.json()) as { notifications?: NotificationDto[]; error?: string };
    if (!res.ok || !json.notifications) throw new Error(json.error ?? "Failed to load notifications.");
    cache = json.notifications;
    loadState = "loaded";
  } catch (err) {
    console.error("Failed to load notifications:", err);
    loadState = "error";
    cache = EMPTY;
  }
  notify();
}

function getSnapshot(): AppNotification[] {
  return cache;
}

function getServerSnapshot(): AppNotification[] {
  return EMPTY;
}

/** The full feed, newest first (that's the order the API returns it in). */
export function useNotifications(): AppNotification[] {
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener);
    void ensureLoaded();
    return () => listeners.delete(listener);
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** How many items are newer than the last time this browser opened the
 * notifications panel — drives the badge dot/count on the bell icon. */
export function useUnreadNotificationCount(): number {
  const items = useNotifications();
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener);
    ensureLastSeenLoaded();
    return () => listeners.delete(listener);
  }, []);
  const getCount = useCallback(() => {
    ensureLastSeenLoaded();
    return items.filter((n) => new Date(n.createdAt).getTime() > lastSeenAt).length;
  }, [items]);
  return useSyncExternalStore(subscribe, getCount, () => 0);
}

/** Call when the notifications panel/sheet is opened — clears the unread
 * badge by bumping the "last seen" watermark to now. */
export function markNotificationsRead() {
  ensureLastSeenLoaded();
  lastSeenAt = Date.now();
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LAST_SEEN_KEY, String(lastSeenAt));
  }
  notify();
}
