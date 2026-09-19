"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, CornerDownRight, Loader2, RotateCcw, Search, Trash2 } from "lucide-react";
import {
  approveCommentAdmin,
  deleteCommentAdmin,
  fetchCommentsAdmin,
  type AdminComment,
  type AdminCommentsStatusFilter,
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

const STATUS_TABS: { key: AdminCommentsStatusFilter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "all", label: "All" },
];

/**
 * Comment moderation queue.  Three tabs — Pending (default), Approved, All —
 * let admins work through the queue, approve good comments, and delete spam.
 * Approving moves a comment from Pending to Approved and makes it publicly
 * visible; the Revoke action on the Approved tab un-publishes it again.
 */
export function CommentsAdminClient() {
  const [status, setStatus] = useState<AdminCommentsStatusFilter>("pending");
  const [comments, setComments] = useState<AdminComment[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [gameSlug, setGameSlug] = useState("");
  const [q, setQ] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"approve" | "revoke" | "delete" | null>(null);

  const load = useCallback(
    async (
      nextPage: number,
      nextStatus: AdminCommentsStatusFilter,
      nextGameSlug: string,
      nextQ: string
    ) => {
      setLoadError(null);
      setComments(null);
      try {
        const result = await fetchCommentsAdmin({
          page: nextPage,
          status: nextStatus,
          gameSlug: nextGameSlug.trim() || undefined,
          q: nextQ.trim() || undefined,
        });
        setComments(result.comments);
        setTotal(result.total);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load comments.");
        setComments([]);
      }
    },
    []
  );

  // Reload whenever the status tab changes; reset page + filters.
  useEffect(() => {
    setPage(1);
    setGameSlug("");
    setQ("");
    load(1, status, "", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    load(1, status, gameSlug, q);
  }

  async function handleApprove(comment: AdminComment) {
    setActingId(comment.id);
    setActionType("approve");
    try {
      await approveCommentAdmin(comment.id, true);
      await load(page, status, gameSlug, q);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to approve comment.");
    } finally {
      setActingId(null);
      setActionType(null);
    }
  }

  async function handleRevoke(comment: AdminComment) {
    if (
      !confirm(
        `Un-publish this comment by ${comment.authorName}? It will go back to the Pending queue.`
      )
    )
      return;
    setActingId(comment.id);
    setActionType("revoke");
    try {
      await approveCommentAdmin(comment.id, false);
      await load(page, status, gameSlug, q);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to revoke approval.");
    } finally {
      setActingId(null);
      setActionType(null);
    }
  }

  async function handleDelete(comment: AdminComment) {
    if (!confirm(`Delete this comment by ${comment.authorName}? This can't be undone.`)) return;
    setActingId(comment.id);
    setActionType("delete");
    try {
      await deleteCommentAdmin(comment.id);
      await load(page, status, gameSlug, q);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete comment.");
    } finally {
      setActingId(null);
      setActionType(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Comments</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            {comments === null
              ? "Loading…"
              : `${total} comment${total === 1 ? "" : "s"}`}
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
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint"
            />
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

      {/* Status tabs */}
      <div className="mb-4 flex items-center gap-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatus(tab.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              status === tab.key
                ? "bg-white/15 text-white"
                : "text-text-faint hover:text-white"
            }`}
          >
            {tab.label}
            {tab.key === "pending" && status !== "pending" && total > 0 && (
              <span className="ml-1.5 rounded-full bg-hot/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {total}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Pending-queue hint */}
      {status === "pending" && comments !== null && comments.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-300">
          <span>
            {total} comment{total === 1 ? "" : "s"} awaiting approval — approve or delete each
            one to keep the queue clear.
          </span>
        </div>
      )}

      {loadError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">
          {loadError}
        </div>
      )}

      {/* Table */}
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
                  {status === "pending"
                    ? "No comments awaiting approval — queue is clear."
                    : "No comments found."}
                </td>
              </tr>
            )}

            {comments?.map((c) => {
              const isActing = actingId === c.id;
              return (
                <tr
                  key={c.id}
                  className="border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03]"
                >
                  <td className="px-4 py-3 text-white/80">/{c.gameSlug}</td>
                  <td className="px-4 py-3 font-semibold text-white">{c.authorName}</td>
                  <td className="max-w-md px-4 py-3 text-white/80">
                    <span className="flex items-start gap-1.5">
                      {c.parentId && (
                        <CornerDownRight
                          size={13}
                          className="mt-0.5 shrink-0 text-text-faint"
                        />
                      )}
                      <span className="line-clamp-2 break-words">{c.body}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-text-faint">
                    {timeAgo(c.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/* Approve — shown only in Pending / All tabs for unapproved */}
                      {!c.isApproved && (
                        <button
                          type="button"
                          onClick={() => handleApprove(c)}
                          disabled={isActing}
                          aria-label={`Approve comment by ${c.authorName}`}
                          title="Approve — make publicly visible"
                          className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/15 disabled:opacity-50"
                        >
                          {isActing && actionType === "approve" ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Check size={13} />
                          )}
                          Approve
                        </button>
                      )}

                      {/* Revoke — shown only for already-approved comments */}
                      {c.isApproved && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(c)}
                          disabled={isActing}
                          aria-label={`Revoke approval for comment by ${c.authorName}`}
                          title="Revoke — move back to pending queue"
                          className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-amber-400 hover:bg-amber-500/15 disabled:opacity-50"
                        >
                          {isActing && actionType === "revoke" ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <RotateCcw size={13} />
                          )}
                          Revoke
                        </button>
                      )}

                      {/* Delete — always available */}
                      <button
                        type="button"
                        onClick={() => handleDelete(c)}
                        disabled={isActing}
                        aria-label={`Delete comment by ${c.authorName}`}
                        title="Permanently delete"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-hot/15 hover:text-hot disabled:opacity-50"
                      >
                        {isActing && actionType === "delete" ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Trash2 size={15} />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm text-text-faint">
          <button
            type="button"
            onClick={() => {
              const next = Math.max(1, page - 1);
              setPage(next);
              load(next, status, gameSlug, q);
            }}
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
            onClick={() => {
              const next = Math.min(totalPages, page + 1);
              setPage(next);
              load(next, status, gameSlug, q);
            }}
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
