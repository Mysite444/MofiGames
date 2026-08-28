"use client";

import { useCallback, useSyncExternalStore } from "react";

// Comments, backed by the real `comments` / `comment_likes` tables via
// src/app/api/comments/** (see that folder for the route handlers and
// supabase/migrations/0004_comments_and_plays.sql for the schema). This
// used to be a plain localStorage mock (no backend at all) — the exported
// function/hook names and call shapes are kept the same as that version so
// CommentsSection.tsx barely had to change, but everything now persists
// server-side, is visible to every visitor (not just the one browser that
// posted it), and is protected by RLS + server-side validation regardless
// of what any client sends.
//
// Mutations (add/delete/like) update the local cache optimistically —
// instantly, before the network round-trip — then reconcile with the
// server response, rolling back on failure. Same interaction pattern the
// old localStorage version had (writes felt instant), just now backed by
// a real request instead of a synchronous disk write.

export interface Comment {
  id: string;
  gameSlug: string;
  /** null = top-level comment, otherwise the id of the comment it replies to */
  parentId: string | null;
  authorId: string;
  authorName: string;
  /** Whether the author is a MofiGames admin — shows the verified badge. */
  authorIsAdmin: boolean;
  text: string;
  createdAt: string; // ISO timestamp
  likeCount: number;
  /** Whether the current viewer has liked this comment. */
  likedByMe: boolean;
}

interface CommentDto {
  id: string;
  gameSlug: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  authorIsAdmin: boolean;
  body: string;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
}

function fromDto(dto: CommentDto): Comment {
  return {
    id: dto.id,
    gameSlug: dto.gameSlug,
    parentId: dto.parentId,
    authorId: dto.authorId,
    authorName: dto.authorName,
    authorIsAdmin: dto.authorIsAdmin,
    text: dto.body,
    createdAt: dto.createdAt,
    likeCount: dto.likeCount,
    likedByMe: dto.likedByMe,
  };
}

const EMPTY: Comment[] = [];

type LoadState = "idle" | "loading" | "loaded" | "error";

// Per-game-slug cache. A comments section is only ever mounted for one
// game at a time in practice, but nothing stops multiple from existing
// (e.g. prefetching), so this is keyed rather than a single flat list.
const cache = new Map<string, Comment[]>();
const loadState = new Map<string, LoadState>();
const postErrors = new Map<string, string>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function getSlugSnapshot(gameSlug: string): Comment[] {
  return cache.get(gameSlug) ?? EMPTY;
}

async function ensureLoaded(gameSlug: string) {
  const state = loadState.get(gameSlug);
  if (state === "loading" || state === "loaded") return;
  loadState.set(gameSlug, "loading");

  try {
    const res = await fetch(`/api/comments?gameSlug=${encodeURIComponent(gameSlug)}`);
    const json = (await res.json()) as { comments?: CommentDto[]; error?: string };
    if (!res.ok || !json.comments) throw new Error(json.error ?? "Failed to load comments.");
    cache.set(gameSlug, json.comments.map(fromDto));
    loadState.set(gameSlug, "loaded");
  } catch (err) {
    console.error(`Failed to load comments for "${gameSlug}":`, err);
    // Mark as errored (not stuck "loading") so the UI shows "no comments"
    // instead of spinning forever — a retry can be added later if needed.
    loadState.set(gameSlug, "error");
    if (!cache.has(gameSlug)) cache.set(gameSlug, EMPTY);
  }
  notify();
}

function findSlugForComment(id: string): string | null {
  for (const [slug, list] of cache.entries()) {
    if (list.some((c) => c.id === id)) return slug;
  }
  return null;
}

function makeTempId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `temp_${crypto.randomUUID()}`;
  return `temp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Posts a new comment (or reply, if parentId is given). Returns an
 * optimistic copy immediately; the real server-assigned id/likeCount/etc.
 * replace it in the store once the request resolves. Rolls back (removes
 * the optimistic entry) if the request fails. */
export function addComment(
  gameSlug: string,
  authorId: string,
  authorName: string,
  text: string,
  parentId: string | null = null,
  authorIsAdmin: boolean = false
): Comment {
  const trimmed = text.trim();
  const tempId = makeTempId();
  const optimistic: Comment = {
    id: tempId,
    gameSlug,
    parentId,
    authorId,
    authorName,
    authorIsAdmin,
    text: trimmed,
    createdAt: new Date().toISOString(),
    likeCount: 0,
    likedByMe: false,
  };

  cache.set(gameSlug, [...(cache.get(gameSlug) ?? EMPTY), optimistic]);
  postErrors.delete(gameSlug);
  notify();

  (async () => {
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameSlug, parentId, body: trimmed }),
      });
      const json = (await res.json()) as { comment?: CommentDto; error?: string };
      if (!res.ok || !json.comment) throw new Error(json.error ?? "Failed to post comment.");
      const real = fromDto(json.comment);
      cache.set(
        gameSlug,
        (cache.get(gameSlug) ?? EMPTY).map((c) => (c.id === tempId ? real : c))
      );
    } catch (err) {
      console.error("Failed to post comment:", err);
      postErrors.set(gameSlug, err instanceof Error ? err.message : "Failed to post comment.");
      cache.set(
        gameSlug,
        (cache.get(gameSlug) ?? EMPTY).filter((c) => c.id !== tempId)
      );
    }
    notify();
  })();

  return optimistic;
}

/** The error from the most recent failed post/reply for a game, if any —
 * cleared automatically on the next successful post, or manually via
 * clearCommentPostError() (e.g. when the user edits their draft again). */
export function useCommentPostError(gameSlug: string): string | null {
  const subscribe = useCallback((listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);
  const getSnapshot = useCallback(() => postErrors.get(gameSlug) ?? null, [gameSlug]);
  const getServerSnapshot = useCallback(() => null, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function clearCommentPostError(gameSlug: string) {
  if (!postErrors.has(gameSlug)) return;
  postErrors.delete(gameSlug);
  notify();
}

/** Deletes a comment (and, if it's a top-level comment, its replies too —
 * the server cascades this, the local removal mirrors it for an instant
 * UI update). No-op if requesterId doesn't match the comment's author
 * (the API enforces this too; this check just avoids a doomed request). */
export function deleteComment(id: string, requesterId: string) {
  const slug = findSlugForComment(id);
  if (!slug) return;
  const current = cache.get(slug) ?? EMPTY;
  const target = current.find((c) => c.id === id);
  if (!target || target.authorId !== requesterId) return;

  cache.set(
    slug,
    current.filter((c) => c.id !== id && c.parentId !== id)
  );
  notify();

  (async () => {
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete comment.");
    } catch (err) {
      console.error("Failed to delete comment:", err);
      // Roll back — restore the full previous list for this game.
      cache.set(slug, current);
      notify();
    }
  })();
}

/** Toggles whether the given user has liked a comment. */
export function toggleCommentLike(id: string, userId: string) {
  void userId; // identity comes from the authenticated session server-side
  const slug = findSlugForComment(id);
  if (!slug) return;
  const current = cache.get(slug) ?? EMPTY;
  const target = current.find((c) => c.id === id);
  if (!target) return;

  const wasLiked = target.likedByMe;
  cache.set(
    slug,
    current.map((c) =>
      c.id === id ? { ...c, likedByMe: !wasLiked, likeCount: c.likeCount + (wasLiked ? -1 : 1) } : c
    )
  );
  notify();

  (async () => {
    try {
      const res = await fetch(`/api/comments/${id}/like`, { method: wasLiked ? "DELETE" : "POST" });
      if (!res.ok) throw new Error("Failed to update like.");
    } catch (err) {
      console.error("Failed to update comment like:", err);
      cache.set(
        slug,
        (cache.get(slug) ?? EMPTY).map((c) => (c.id === id ? target : c))
      );
      notify();
    }
  })();
}

/** Subscribes to every comment + reply for a single game, load order.
 * Kicks off the initial fetch the first time it's used for a given slug. */
export function useGameComments(gameSlug: string): Comment[] {
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
