"use client";

import { useCallback, useEffect, useState } from "react";
import { CornerDownRight, Loader2, Search, Trash2 } from "lucide-react";
import {
  deleteCommentAdmin,
  fetchCommentsAdmin,
  type AdminComment,
} from "@/lib/supabase/admin-content";

const PAGE_SIZE = 50;

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Moderation view: every comment across every game, newest first, with a
 * game-slug filter, a text search, and a delete button. Deleting here goes
 * through the same DELETE /api/comments/:id route the public comment
 * section uses — it allows either the comment's author or an admin.
 */
export function CommentsAdminClient() {
  const [comments, setComments] = useState<AdminComment[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [gameSlug, setGameSlug] = useState("");
  const [q, setQ] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (nextPage: number, nextGameSlug: string, nextQ: string) => {
    setLoadError(null);
    try {
      const result = await fetchCommentsAdmin({
        page: nextPage,
        gameSlug: nextGameSlug.trim() || undefined,
        q: nextQ.trim() || undefined,
      });
      setComments(result.comments);
      setTotal(result.total);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load comments.");
    }
  }, []);

  useEffect(() => {
    load(page, gameSlug, q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load(1, gameSlug, q);
  }

  async function handleDelete(comment: AdminComment) {
    if (!confirm(`Delete this comment by ${comment.authorName}? This can't be undone.`)) return;
    setDeletingId(comment.id);
    try {
      await deleteCommentAdmin(comment.id);
      await load(page, gameSlug, q);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete comment.");
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Comments</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            {comments ? `${total} comment${total === 1 ? "" : "s"}` : "Loading…"}
          </p>
        </div>
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2">
          <input
            value={gameSlug}
            onChange={(e) => setGameSlug(e.target.value)}
            placeholder="Filter by game slug…"
            className="admin-input w-40"
          />
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search comments…"
              className="admin-input w-56 pl-8"
            />
          </div>
          <button
            type="submit"
            className="glass rounded-full px-4 py-2 text-xs font-semibold text-white/80 hover:text-white"
          >
            Search
          </button>
        </form>
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>
      )}

      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-border)] text-xs uppercase tracking-wide text-text-faint">
              <th className="px-4 py-3 font-semibold">Game</th>
              <th className="px-4 py-3 font-semibold">Author</th>
              <th className="px-4 py-3 font-semibold">Comment</th>
              <th className="px-4 py-3 font-semibold">Posted</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {comments === null && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-faint">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {comments?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-faint">
                  No comments found.
                </td>
              </tr>
            )}
            {comments?.map((c) => (
              <tr
                key={c.id}
                className="border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03]"
              >
                <td className="px-4 py-3 text-white/80">/{c.gameSlug}</td>
                <td className="px-4 py-3 font-semibold text-white">{c.authorName}</td>
                <td className="max-w-md px-4 py-3 text-white/80">
                  <span className="flex items-start gap-1.5">
                    {c.parentId && <CornerDownRight size={13} className="mt-0.5 shrink-0 text-text-faint" />}
                    <span className="line-clamp-2 break-words">{c.body}</span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-text-faint">{timeAgo(c.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => handleDelete(c)}
                      disabled={deletingId === c.id}
                      aria-label={`Delete comment by ${c.authorName}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-hot/15 hover:text-hot disabled:opacity-50"
                    >
                      {deletingId === c.id ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Trash2 size={15} />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm text-text-faint">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="glass rounded-full px-4 py-2 font-semibold text-white/80 hover:text-white disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="glass rounded-full px-4 py-2 font-semibold text-white/80 hover:text-white disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
