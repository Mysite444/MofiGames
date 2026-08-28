"use client";

import { useCallback, useSyncExternalStore } from "react";

// Public game reviews (1-5 stars + short text), one per (user, game).
// Backed by the `game_reviews` table via src/app/api/games/[slug]/reviews
// (see that route and supabase/migrations/0059_game_reviews.sql for the
// schema/RLS). Mirrors src/lib/comments.ts's shape and optimistic-update
// pattern on purpose, so ReviewsSection.tsx and CommentsSection.tsx behave
// consistently — writes feel instant, then reconcile with the server
// response, rolling back on failure.

export interface Review {
  id: string;
  gameSlug: string;
  authorId: string;
  authorName: string;
  /** Whether the author is a MofiGames admin — shows the verified badge. */
  authorIsAdmin: boolean;
  rating: number; // 1-5
  text: string;
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
}

interface ReviewDto {
  id: string;
  gameSlug: string;
  authorId: string;
  authorName: string;
  authorIsAdmin: boolean;
  rating: number;
  reviewText: string;
  createdAt: string;
  updatedAt: string;
}

function fromDto(dto: ReviewDto): Review {
  return {
    id: dto.id,
    gameSlug: dto.gameSlug,
    authorId: dto.authorId,
    authorName: dto.authorName,
    authorIsAdmin: dto.authorIsAdmin,
    rating: dto.rating,
    text: dto.reviewText,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

const EMPTY: Review[] = [];

type LoadState = "idle" | "loading" | "loaded" | "error";

// Per-game-slug cache, same reasoning as comments.ts.
const cache = new Map<string, Review[]>();
const loadState = new Map<string, LoadState>();
const postErrors = new Map<string, string>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function getSlugSnapshot(gameSlug: string): Review[] {
  return cache.get(gameSlug) ?? EMPTY;
}

async function ensureLoaded(gameSlug: string) {
  const state = loadState.get(gameSlug);
  if (state === "loading" || state === "loaded") return;
  loadState.set(gameSlug, "loading");

  try {
    const res = await fetch(`/api/games/${encodeURIComponent(gameSlug)}/reviews`);
    const json = (await res.json()) as { reviews?: ReviewDto[]; error?: string };
    if (!res.ok || !json.reviews) throw new Error(json.error ?? "Failed to load reviews.");
    cache.set(gameSlug, json.reviews.map(fromDto));
    loadState.set(gameSlug, "loaded");
  } catch (err) {
    console.error(`Failed to load reviews for "${gameSlug}":`, err);
    loadState.set(gameSlug, "error");
    if (!cache.has(gameSlug)) cache.set(gameSlug, EMPTY);
  }
  notify();
}

function makeTempId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `temp_${crypto.randomUUID()}`;
  return `temp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Posts or updates the current user's review for a game — one review
 * per user per game, so this is an upsert (the server resolves it via the
 * table's unique(user_id, game_id)). Returns an optimistic copy
 * immediately; the real server-assigned id/timestamps replace it once the
 * request resolves. Rolls back to whatever was there before on failure. */
export function submitReview(
  gameSlug: string,
  authorId: string,
  authorName: string,
  rating: number,
  text: string,
  authorIsAdmin: boolean = false
): Review {
  const trimmed = text.trim();
  const current = cache.get(gameSlug) ?? EMPTY;
  const existing = current.find((r) => r.authorId === authorId);
  const now = new Date().toISOString();

  const optimistic: Review = {
    id: existing?.id ?? makeTempId(),
    gameSlug,
    authorId,
    authorName,
    authorIsAdmin,
    rating,
    text: trimmed,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  cache.set(
    gameSlug,
    existing ? current.map((r) => (r.authorId === authorId ? optimistic : r)) : [optimistic, ...current]
  );
  postErrors.delete(gameSlug);
  notify();

  (async () => {
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(gameSlug)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, reviewText: trimmed }),
      });
      const json = (await res.json()) as { review?: ReviewDto; error?: string };
      if (!res.ok || !json.review) throw new Error(json.error ?? "Failed to post review.");
      const real = fromDto(json.review);
      cache.set(
        gameSlug,
        (cache.get(gameSlug) ?? EMPTY).map((r) => (r.authorId === authorId ? real : r))
      );
    } catch (err) {
      console.error("Failed to post review:", err);
      postErrors.set(gameSlug, err instanceof Error ? err.message : "Failed to post review.");
      const latest = cache.get(gameSlug) ?? EMPTY;
      cache.set(
        gameSlug,
        existing
          ? latest.map((r) => (r.authorId === authorId ? existing : r))
          : latest.filter((r) => r.authorId !== authorId)
      );
    }
    notify();
  })();

  return optimistic;
}

/** The error from the most recent failed post/update for a game, if any —
 * cleared automatically on the next successful post, or manually via
 * clearReviewPostError() (e.g. when the user edits their draft again). */
export function useReviewPostError(gameSlug: string): string | null {
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  const getSnapshot = useCallback(() => postErrors.get(gameSlug) ?? null, [gameSlug]);
  const getServerSnapshot = useCallback(() => null, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function clearReviewPostError(gameSlug: string) {
  if (!postErrors.has(gameSlug)) return;
  postErrors.delete(gameSlug);
  notify();
}

/** Deletes the given user's own review for a game. No-op if they don't
 * have one (the API enforces "own review only" too; this check just
 * avoids a doomed request). */
export function deleteReview(gameSlug: string, requesterId: string) {
  const current = cache.get(gameSlug) ?? EMPTY;
  const target = current.find((r) => r.authorId === requesterId);
  if (!target) return;

  cache.set(
    gameSlug,
    current.filter((r) => r.authorId !== requesterId)
  );
  notify();

  (async () => {
    try {
      const res = await fetch(`/api/games/${encodeURIComponent(gameSlug)}/reviews`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete review.");
    } catch (err) {
      console.error("Failed to delete review:", err);
      cache.set(gameSlug, current);
      notify();
    }
  })();
}

/** Subscribes to every review for a single game. Kicks off the initial
 * fetch the first time it's used for a given slug. */
export function useGameReviews(gameSlug: string): Review[] {
  const subscribe = useCallback(
    (listener: () => void) => {
      listeners.add(listener);
      void ensureLoaded(gameSlug);
      return () => listeners.delete(listener);
    },
    [gameSlug]
  );
  const getSnapshot = useCallback(() => getSlugSnapshot(gameSlug), [gameSlug]);
  const getServerSnapshot = useCallback(() => EMPTY, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
