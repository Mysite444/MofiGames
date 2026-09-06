"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Clock, MessageSquare, ThumbsUp, CornerDownRight, Trash2 } from "lucide-react";
import { VerifiedBadge } from "./VerifiedBadge";
import { useAuth } from "@/lib/auth-context";
import {
  addComment,
  deleteComment,
  toggleCommentLike,
  useGameComments,
  useCommentPostError,
  clearCommentPostError,
  type Comment,
} from "@/lib/comments";
import { Avatar } from "./Avatar";
import type { Game } from "@/lib/types";

const PAGE_SIZE = 8;

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

/**
 * Comments for a single game — one flat post box up top, then top-level
 * comments (sortable Newest/Top) each with one level of replies, likes, and
 * delete-own.
 *
 * Since migration 0077, new comments are held for admin approval before they
 * become publicly visible. The author sees their own comment immediately
 * with a "Pending moderation" badge for the duration of the current session.
 */
export function CommentsSection({ game }: { game: Game }) {
  const { user, ready } = useAuth();
  const comments = useGameComments(game.slug);
  const postError = useCommentPostError(game.slug);

  const [sort, setSort] = useState<"newest" | "top">("newest");
  const [draft, setDraft] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");

  // Separate approved and pending top-level comments.
  const { approved: topLevel, pending: pendingTopLevel } = useMemo(() => {
    const all = comments.filter((c) => c.parentId === null);
    const approved = [...all.filter((c) => !c.pendingApproval)].sort((a, b) => {
      if (sort === "top") {
        const diff = b.likeCount - a.likeCount;
        if (diff !== 0) return diff;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    const pending = all.filter((c) => c.pendingApproval);
    return { approved, pending };
  }, [comments, sort]);

  function repliesFor(parentId: string) {
    return comments
      .filter((c) => c.parentId === parentId && !c.pendingApproval)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  function handlePost(e: FormEvent) {
    e.preventDefault();
    if (!user || !draft.trim()) return;
    addComment(game.slug, user.id, user.name, draft, null, user.isAdmin);
    setDraft("");
  }

  function handleReplySubmit(parentId: string) {
    if (!user || !replyDraft.trim()) return;
    addComment(game.slug, user.id, user.name, replyDraft, parentId, user.isAdmin);
    setReplyDraft("");
    setReplyingTo(null);
  }

  const visible = topLevel.slice(0, visibleCount);
  const hasMore = topLevel.length > visible.length;
  // Public comment count: only approved, not pending.
  const approvedCount = comments.filter((c) => !c.pendingApproval).length;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-text sm:text-xl">
          <MessageSquare size={18} />
          Comments
          <span className="text-text-faint">({approvedCount})</span>
        </h2>
        {topLevel.length > 1 && (
          <div className="glass flex items-center gap-1 rounded-full p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSort("newest")}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                sort === "newest" ? "bg-white/15 text-text" : "text-text-faint"
              }`}
            >
              Newest
            </button>
            <button
              type="button"
              onClick={() => setSort("top")}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                sort === "top" ? "bg-white/15 text-text" : "text-text-faint"
              }`}
            >
              Top
            </button>
          </div>
        )}
      </div>

      {/* Post box */}
      {ready && user && (
        <form onSubmit={handlePost} className="flex items-start gap-3">
          <Avatar name={user.name} size={36} />
          <div className="glass input-glow flex flex-1 flex-col gap-2 rounded-2xl p-3">
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (postError) clearCommentPostError(game.slug);
              }}
              placeholder={`Comment as ${user.name}…`}
              rows={2}
              className="w-full resize-none bg-transparent text-sm text-white placeholder:text-text-faint focus:outline-none"
            />
            {postError && (
              <p className="text-xs font-medium text-hot">{postError}</p>
            )}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!draft.trim()}
                className="glow-yellow-button inline-flex items-center justify-center rounded-full bg-[var(--color-menu-bg)] px-5 py-2 text-xs font-bold text-white transition-opacity disabled:pointer-events-none disabled:opacity-40"
              >
                Post
              </button>
            </div>
          </div>
        </form>
      )}

      {ready && !user && (
        <div className="glass flex items-center justify-between gap-3 rounded-2xl p-4 text-sm">
          <span className="text-text-muted">Log in to join the conversation.</span>
          <Link
            href="/login"
            className="glass-strong shrink-0 rounded-full px-4 py-2 text-xs font-bold text-white"
          >
            Log In
          </Link>
        </div>
      )}

      {/* Author's own pending comments — shown only in current session */}
      {pendingTopLevel.length > 0 && (
        <div className="flex flex-col gap-3">
          {pendingTopLevel.map((c) => (
            <PendingCommentRow key={c.id} comment={c} userId={user?.id ?? null} />
          ))}
        </div>
      )}

      {/* Approved comment list */}
      {topLevel.length === 0 && pendingTopLevel.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-faint">
          No comments yet — be the first to say something.
        </p>
      ) : topLevel.length === 0 ? null : (
        <div className="flex flex-col gap-5">
          {visible.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              replies={repliesFor(c.id)}
              userId={user?.id ?? null}
              canReply={Boolean(user)}
              isReplying={replyingTo === c.id}
              replyDraft={replyDraft}
              onStartReply={(targetName) => {
                setReplyingTo(c.id);
                setReplyDraft(targetName ? `@${targetName} ` : "");
              }}
              onCancelReply={() => setReplyingTo(null)}
              onReplyDraftChange={setReplyDraft}
              onSubmitReply={() => handleReplySubmit(c.id)}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
          className="glass mx-auto rounded-full px-5 py-2 text-xs font-semibold text-text-muted hover:text-text"
        >
          Show more comments
        </button>
      )}
    </section>
  );
}

/** Renders a comment the current user just submitted that is awaiting admin
 * approval. Styled with an amber tint and a "Pending moderation" badge so
 * it's clear the author can see their own comment but others cannot. */
function PendingCommentRow({
  comment,
  userId,
}: {
  comment: Comment;
  userId: string | null;
}) {
  const isOwn = Boolean(userId) && userId === comment.authorId;
  return (
    <div className="flex items-start gap-3 opacity-80">
      <Avatar name={comment.authorName} size={36} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="font-semibold text-text">{comment.authorName}</span>
          <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
            <Clock size={9} />
            Pending moderation
          </span>
        </div>
        <p className="break-words text-sm text-text-muted">{comment.text}</p>
        {isOwn && (
          <div className="mt-0.5 flex items-center gap-4 text-xs font-semibold text-text-faint">
            <button
              type="button"
              onClick={() => userId && deleteComment(comment.id, userId)}
              className="flex items-center gap-1.5 hover:text-hot"
            >
              <Trash2 size={13} />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentItem({
  comment,
  replies,
  userId,
  canReply,
  isReplying,
  replyDraft,
  onStartReply,
  onCancelReply,
  onReplyDraftChange,
  onSubmitReply,
}: {
  comment: Comment;
  replies: Comment[];
  userId: string | null;
  canReply: boolean;
  isReplying: boolean;
  replyDraft: string;
  onStartReply: (targetName?: string) => void;
  onCancelReply: () => void;
  onReplyDraftChange: (v: string) => void;
  onSubmitReply: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <CommentRow
        comment={comment}
        userId={userId}
        onReply={canReply ? () => onStartReply() : undefined}
      />

      {isReplying && (
        <div className="ml-12 flex items-start gap-2.5">
          <div className="glass input-glow flex flex-1 flex-col gap-2 rounded-2xl p-3">
            <textarea
              autoFocus
              value={replyDraft}
              onChange={(e) => onReplyDraftChange(e.target.value)}
              placeholder={`Reply to ${comment.authorName}…`}
              rows={2}
              className="w-full resize-none bg-transparent text-sm text-white placeholder:text-text-faint focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancelReply}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-text-faint hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmitReply}
                disabled={!replyDraft.trim()}
                className="glow-yellow-button rounded-full bg-[var(--color-menu-bg)] px-4 py-1.5 text-xs font-bold text-white disabled:pointer-events-none disabled:opacity-40"
              >
                Reply
              </button>
            </div>
          </div>
        </div>
      )}

      {replies.length > 0 && (
        <div className="ml-12 flex flex-col gap-3 border-l-2 border-white/10 pl-3.5">
          {replies.map((r) => (
            <CommentRow
              key={r.id}
              comment={r}
              userId={userId}
              onReply={canReply ? () => onStartReply(r.authorName) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  userId,
  onReply,
}: {
  comment: Comment;
  userId: string | null;
  onReply?: () => void;
}) {
  const liked = comment.likedByMe;
  const isOwn = Boolean(userId) && userId === comment.authorId;

  return (
    <div className="flex items-start gap-3">
      <Avatar name={comment.authorName} size={36} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="inline-flex items-center gap-1 font-semibold text-text">
            {comment.authorName}
            {comment.authorIsAdmin && (
              <VerifiedBadge size={14} className="translate-y-[1px]" />
            )}
          </span>
          <span className="text-xs text-text-faint">{timeAgo(comment.createdAt)}</span>
        </div>
        <p className="break-words text-sm text-text-muted">{comment.text}</p>
        <div className="mt-0.5 flex items-center gap-4 text-xs font-semibold text-text-faint">
          <button
            type="button"
            onClick={() => userId && toggleCommentLike(comment.id, userId)}
            disabled={!userId}
            aria-pressed={liked}
            className={`flex items-center gap-1.5 transition-colors disabled:pointer-events-none disabled:opacity-50 ${
              liked ? "text-gold" : "hover:text-text"
            }`}
          >
            <ThumbsUp size={13} className={liked ? "fill-gold" : ""} />
            {comment.likeCount > 0 ? comment.likeCount : "Like"}
          </button>
          {onReply && (
            <button
              type="button"
              onClick={onReply}
              className="flex items-center gap-1.5 hover:text-text"
            >
              <CornerDownRight size={13} />
              Reply
            </button>
          )}
          {isOwn && (
            <button
              type="button"
              onClick={() => userId && deleteComment(comment.id, userId)}
              className="flex items-center gap-1.5 hover:text-hot"
            >
              <Trash2 size={13} />
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
