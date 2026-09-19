"use client";

import { useCallback, useSyncExternalStore } from "react";

// Comments, backed by the real `comments` / `comment_likes` tables via
// src/app/api/comments/** (see that folder for the route handlers and
// supabase/migrations/0004_comments_and_plays.sql for the schema).
//
// Since migration 0077, new comments land in a pending state on the server
// (is_approved = false) and are only publicly visible after an admin approves
// them.  From the author's perspective:
//   1. They submit → we show the comment immediately as "Pending moderation"
//      (optimistic UI with a visual flag).
//   2. The POST resolves → if is_approved is false (always for new posts),
//      we mark the entry as pendingApproval: true so the UI can badge it.
//   3. On the next page load the GET won't return the comment (RLS only
//      serves approved rows), so the pending entry disappears — this is
//      expected and mirrors every site that has a moderation queue.

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
  /** True when this comment was just submitted and is awaiting admin approval.
   * Only exists in the current browser session — disappears on page reload
   * because the GET endpoint only returns approved comments. */
  pendingApproval?: boolean;
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
  isApproved: boolean;
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
    // Propagate approval state so the UI can badge pending comments.
    pendingApproval: !dto.isApproved,
  };
}

const EMPTY: Comment[] = [];

type LoadState = "idle" | "loading" | "loaded" | "error";

// Per-game-slug cache.
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

    // Merge server results with any locally-pending comments still in the
    // cache (the user may have posted while the game was already loaded).
    // Server never returns pending comments, so this union is safe.
    const pending = (cache.get(gameSlug) ?? EMPTY).filter((c) => c.pendingApproval);
    const approved = json.comments.map(fromDto);
    cache.set(gameSlug, [...approved, ...pending]);
    loadState.set(gameSlug, "loaded");
  } catch (err) {
    console.error(`Failed to load comments for "${gameSlug}":`, err);
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
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return `temp_${crypto.randomUUID()}`;
  return `temp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Posts a new comment (or reply, if parentId is given).
 *
 * The comment is shown immediately with pendingApproval: true (optimistic).
 * Once the server confirms, we keep the pending flag set (the comment won't
 * appear publicly until an admin approves it, so there's no need to flip it
 * to a "real" approved comment in the local cache). */
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
    pendingApproval: true,
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

      // Replace the temp entry with the real one from the server.
      // fromDto() will carry over pendingApproval: true because the server
      // always returns is_approved: false for new comments.
      const real = fromDto(json.comment);
      cache.set(
        gameSlug,
        (cache.get(gameSlug) ?? EMPTY).map((c) => (c.id === tempId ? real : c))
      );
    } catch (err) {
      console.error("Failed to post comment:", err);
      postErrors.set(
        gameSlug,
        err instanceof Error ? err.message : "Failed to post comment."
      );
      cache.set(
        gameSlug,
        (cache.get(gameSlug) ?? EMPTY).filter((c) => c.id !== tempId)
      );
    }
    notify();
  })();

  return optimistic;
}

/** The error from the most recent failed post/reply for a game, if any. */
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

/** Deletes a comment (and its replies via cascade). The author-check guards
 * against accidental deletes of others' pending-approval comments that may
 * be in the local cache.  The API enforces ownership too. */
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
      cache.set(slug, current);
      notify();
    }
  })();
}

/** Toggles whether the given user has liked a comment.
 * Pending comments can't be liked (no server row in the approved set),
 * so we guard against acting on them here. */
export function toggleCommentLike(id: string, userId: string) {
  void userId;
  const slug = findSlugForComment(id);
  if (!slug) return;
  const current = cache.get(slug) ?? EMPTY;
  const target = current.find((c) => c.id === id);
  // Don't attempt to like a pending comment — it isn't in the public set yet.
  if (!target || target.pendingApproval) return;

  const wasLiked = target.likedByMe;
  cache.set(
    slug,
    current.map((c) =>
      c.id === id
        ? { ...c, likedByMe: !wasLiked, likeCount: c.likeCount + (wasLiked ? -1 : 1) }
        : c
    )
  );
  notify();

  (async () => {
    try {
      const res = await fetch(`/api/comments/${id}/like`, {
        method: wasLiked ? "DELETE" : "POST",
      });
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

/** Subscribes to every comment + reply for a single game, oldest first. */
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
