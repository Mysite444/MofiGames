"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Flag,
  ChevronDown,
  ChevronUp,
  StickyNote,
  ListChecks,
  History as HistoryIcon,
  Plus,
  UserCog,
  Scale,
} from "lucide-react";
import {
  fetchReportsAdmin,
  updateReportAdmin,
  createReportAdmin,
  fetchReportNotesAdmin,
  addReportNoteAdmin,
  fetchReportActionsAdmin,
  addReportActionAdmin,
  fetchReportAuditAdmin,
  fetchReportCategoriesAdmin,
  fetchStaffListAdmin,
  REPORT_STATUS_LABELS,
  type ReportRow,
  type ReportStatus,
  type ReportKind,
  type ReportPriority,
  type ReportActionType,
  type ReportNoteRow,
  type ReportActionRow,
  type ReportAuditEntryRow,
  type ReportCategoryRow,
  type StaffMemberRow,
} from "@/lib/supabase/admin-content";

const PAGE_SIZE = 30;

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

const STATUS_COLORS: Record<ReportStatus, string> = {
  pending: "bg-amber-400/15 text-amber-400",
  reviewed: "bg-sky-400/15 text-sky-400",
  resolved: "bg-emerald-400/15 text-emerald-400",
  dismissed: "bg-white/10 text-white/60",
};

const PRIORITY_COLORS: Record<ReportPriority, string> = {
  low: "bg-white/10 text-white/50",
  normal: "bg-white/10 text-white/70",
  high: "bg-orange-400/15 text-orange-400",
  urgent: "bg-hot/15 text-hot",
};

const REASON_LABELS: Record<string, string> = {
  spam: "Spam",
  harassment: "Harassment / Hate Speech",
  inappropriate_content: "Inappropriate content",
  impersonation: "Impersonation",
  other: "Other",
};

const KIND_LABELS: Record<ReportKind, string> = {
  user: "User report",
  copyright: "Copyright claim",
  dmca: "DMCA takedown",
  counter_notice: "Counter-notice",
};

const ACTION_LABELS: Record<ReportActionType, string> = {
  warning: "Warning issued",
  remove_content: "Content removed",
  suspend_user: "User suspended",
  ban_user: "User banned",
};

type StatusScope = "all" | "open" | "closed" | ReportStatus;

export interface ReportsAdminClientProps {
  title: string;
  description?: string;
  /** Fixed report kind for this screen, "copyright_all" for every
   * copyright-ish kind at once (Copyright Claim History), or omit to show
   * every kind (Report Queue / Report History). */
  kind?: ReportKind | "copyright_all";
  /** Fixed abuse reason for this screen (implies kind="user"), e.g. the
   * dedicated Spam / Harassment / Impersonation / Inappropriate Content
   * views. */
  reason?: string;
  /** Which report_categories group to offer in the category filter/picker. */
  categoryGroup?: "user" | "copyright" | "abuse";
  /** Report Queue defaults to open items, Report History to closed ones,
   * a fixed-kind/reason view defaults to showing everything. */
  defaultScope?: StatusScope;
  /** Show a "Log a case" button for manually recording a report/claim
   * that came in outside the app. */
  allowCreate?: boolean;
  emptyMessage?: string;
}

export function ReportsAdminClient({
  title,
  description,
  kind,
  reason,
  categoryGroup,
  defaultScope = "all",
  allowCreate = false,
  emptyMessage = "No reports found.",
}: ReportsAdminClientProps) {
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusScope>(defaultScope);
  const [categoryKey, setCategoryKey] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [categories, setCategories] = useState<ReportCategoryRow[]>([]);
  const [staff, setStaff] = useState<StaffMemberRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(
    async (nextPage: number, nextStatus: StatusScope, nextCategory: string, nextAssignedTo: string) => {
      setLoadError(null);
      try {
        const result = await fetchReportsAdmin({
          page: nextPage,
          status: nextStatus,
          kind: kind ?? "all",
          reason,
          categoryKey: nextCategory || undefined,
          assignedTo: nextAssignedTo || undefined,
        });
        setReports(result.reports);
        setTotal(result.total);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load reports.");
      }
    },
    [kind, reason]
  );

  useEffect(() => {
    load(page, status, categoryKey, assignedTo);
  }, [load, page, status, categoryKey, assignedTo]);

  useEffect(() => {
    fetchReportCategoriesAdmin(categoryGroup ?? "all")
      .then(setCategories)
      .catch(() => setCategories([]));
    fetchStaffListAdmin()
      .then(setStaff)
      .catch(() => setStaff([]));
  }, [categoryGroup]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function refresh() {
    load(page, status, categoryKey, assignedTo);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">{title}</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            {description ? `${description} — ` : ""}
            {reports ? `${total} report${total === 1 ? "" : "s"}` : "Loading…"}
          </p>
        </div>
        {allowCreate && (
          <button
            type="button"
            onClick={() => setCreateOpen((v) => !v)}
            className="glow-yellow-button flex items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2 text-sm font-bold text-white"
          >
            <Plus size={15} />
            Log a case
          </button>
        )}
      </div>

      {createOpen && (
        <CreateReportForm
          defaultKind={kind && kind !== "copyright_all" ? kind : "user"}
          defaultReason={reason}
          categories={categories}
          onCreated={() => {
            setCreateOpen(false);
            refresh();
          }}
          onCancel={() => setCreateOpen(false)}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as StatusScope);
            setPage(1);
          }}
          className="admin-input w-44"
        >
          <option value="all">All statuses</option>
          <option value="open">Open queue (Open + Under Review)</option>
          <option value="closed">History (Resolved + Rejected)</option>
          <option value="pending">Open</option>
          <option value="reviewed">Under Review</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Rejected</option>
        </select>
        {categories.length > 0 && (
          <select
            value={categoryKey}
            onChange={(e) => {
              setCategoryKey(e.target.value);
              setPage(1);
            }}
            className="admin-input w-48"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        <select
          value={assignedTo}
          onChange={(e) => {
            setAssignedTo(e.target.value);
            setPage(1);
          }}
          className="admin-input w-44"
        >
          <option value="">Any assignee</option>
          <option value="unassigned">Unassigned</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>
      )}

      {reports === null && (
        <div className="flex items-center justify-center py-20 text-text-faint">
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      {reports?.length === 0 && (
        <div className="glass rounded-xl px-4 py-10 text-center text-text-faint">{emptyMessage}</div>
      )}

      <div className="flex flex-col gap-3">
        {reports?.map((r) => (
          <ReportCard
            key={r.id}
            report={r}
            expanded={expandedId === r.id}
            onToggle={() => setExpandedId((id) => (id === r.id ? null : r.id))}
            categories={categories}
            staff={staff}
            onChanged={refresh}
          />
        ))}
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

function ReportCard({
  report: r,
  expanded,
  onToggle,
  categories,
  staff,
  onChanged,
}: {
  report: ReportRow;
  expanded: boolean;
  onToggle: () => void;
  categories: ReportCategoryRow[];
  staff: StaffMemberRow[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(fields: Parameters<typeof updateReportAdmin>[1]) {
    setBusy(true);
    setError(null);
    try {
      await updateReportAdmin(r.id, fields);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  const isCopyright = r.kind !== "user";

  return (
    <div className="glass rounded-xl p-4">
      <button type="button" onClick={onToggle} className="flex w-full flex-wrap items-start justify-between gap-2 text-left">
        <div className="flex items-center gap-2">
          {isCopyright ? <Scale size={14} className="text-hot" /> : <Flag size={14} className="text-hot" />}
          <span className="font-semibold text-white">
            {isCopyright ? r.claimant_name || "Unknown claimant" : r.reported_user_name || "Deleted user"}
          </span>
          {!isCopyright && <span className="text-xs text-text-faint">reported by {r.reporter_name}</span>}
          {isCopyright && <span className="text-xs text-text-faint">{KIND_LABELS[r.kind]}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${PRIORITY_COLORS[r.priority]}`}>
            {r.priority}
          </span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_COLORS[r.status]}`}>
            {REPORT_STATUS_LABELS[r.status]}
          </span>
          {expanded ? <ChevronUp size={16} className="text-text-faint" /> : <ChevronDown size={16} className="text-text-faint" />}
        </div>
      </button>

      <p className="mb-1 mt-2 text-sm text-white/85">
        {r.reason && <span className="font-semibold">{REASON_LABELS[r.reason] ?? r.reason}</span>}
        {r.category_key && !r.reason && <span className="font-semibold">{r.category_key}</span>}
        {r.details && <> — {r.details}</>}
      </p>
      {isCopyright && (
        <p className="mb-1 text-xs text-text-faint">
          {r.claimant_email && <>{r.claimant_email} · </>}
          {r.infringing_url && <>URL: {r.infringing_url}</>}
        </p>
      )}
      {r.context_game_slug && <p className="mb-2 text-xs text-text-faint">Context: /{r.context_game_slug}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-text-faint">
          {timeAgo(r.created_at)}
          {r.assigned_moderator_name && <> · assigned to {r.assigned_moderator_name}</>}
        </span>
        <select
          value={r.status}
          disabled={busy}
          onChange={(e) => patch({ status: e.target.value as ReportStatus })}
          className="admin-input w-36 text-xs"
        >
          <option value="pending">Open</option>
          <option value="reviewed">Under Review</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Rejected</option>
        </select>
      </div>

      {error && <p className="mt-2 text-xs font-medium text-hot">{error}</p>}

      {expanded && (
        <div className="mt-4 border-t border-[var(--color-surface-border)] pt-4">
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-xs text-text-faint">
              <span className="mb-1 flex items-center gap-1 font-semibold text-white/80">
                <UserCog size={13} /> Assign moderator
              </span>
              <select
                value={r.assigned_moderator_id ?? ""}
                disabled={busy}
                onChange={(e) => patch({ assignedModeratorId: e.target.value || null })}
                className="admin-input w-full"
              >
                <option value="">Unassigned</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.role})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-text-faint">
              <span className="mb-1 block font-semibold text-white/80">Priority</span>
              <select
                value={r.priority}
                disabled={busy}
                onChange={(e) => patch({ priority: e.target.value as ReportPriority })}
                className="admin-input w-full"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="text-xs text-text-faint">
              <span className="mb-1 block font-semibold text-white/80">Category</span>
              <select
                value={r.category_key ?? ""}
                disabled={busy}
                onChange={(e) => patch({ categoryKey: e.target.value || null })}
                className="admin-input w-full"
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <ReportNotes reportId={r.id} />
          <ReportActions reportId={r.id} defaultTargetUserId={r.reported_user_id} onActionTaken={onChanged} />
          <ReportAudit reportId={r.id} />
        </div>
      )}
    </div>
  );
}

function ReportNotes({ reportId }: { reportId: string }) {
  const [notes, setNotes] = useState<ReportNoteRow[] | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchReportNotesAdmin(reportId)
      .then(setNotes)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load notes."));
  }, [reportId]);

  useEffect(load, [load]);

  async function submit() {
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addReportNoteAdmin(reportId, text.trim());
      setText("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4">
      <span className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-faint">
        <StickyNote size={13} /> Moderator notes
      </span>
      <div className="mb-2 flex flex-col gap-2">
        {notes === null && <Loader2 size={14} className="animate-spin text-text-faint" />}
        {notes?.length === 0 && <p className="text-xs text-text-faint">No notes yet.</p>}
        {notes?.map((n) => (
          <div key={n.id} className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/80">
            <p className="mb-1 font-semibold text-white/60">
              {n.moderator_name} · {timeAgo(n.created_at)}
            </p>
            {n.note}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add an internal note…"
          rows={2}
          className="admin-input flex-1 text-xs"
        />
        <button
          type="button"
          disabled={saving || !text.trim()}
          onClick={submit}
          className="glow-yellow-button self-start rounded-full bg-[var(--color-menu-bg)] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>
      {error && <p className="mt-1 text-xs font-medium text-hot">{error}</p>}
    </div>
  );
}

function ReportActions({
  reportId,
  defaultTargetUserId,
  onActionTaken,
}: {
  reportId: string;
  defaultTargetUserId: string | null;
  onActionTaken: () => void;
}) {
  const [actions, setActions] = useState<ReportActionRow[] | null>(null);
  const [actionType, setActionType] = useState<ReportActionType>("warning");
  const [details, setDetails] = useState("");
  const [banDays, setBanDays] = useState<string>("7");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchReportActionsAdmin(reportId)
      .then(setActions)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load actions."));
  }, [reportId]);

  useEffect(load, [load]);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await addReportActionAdmin(reportId, {
        actionType,
        targetUserId: defaultTargetUserId ?? undefined,
        details: details.trim() || undefined,
        banExpiresInDays: actionType === "suspend_user" ? Number(banDays) || 7 : undefined,
      });
      setDetails("");
      load();
      onActionTaken();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record action.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4">
      <span className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-faint">
        <ListChecks size={13} /> Actions taken
      </span>
      <div className="mb-2 flex flex-col gap-2">
        {actions === null && <Loader2 size={14} className="animate-spin text-text-faint" />}
        {actions?.length === 0 && <p className="text-xs text-text-faint">No actions recorded yet.</p>}
        {actions?.map((a) => (
          <div key={a.id} className="rounded-lg bg-white/5 px-3 py-2 text-xs text-white/80">
            <p className="mb-1 font-semibold text-white/60">
              {ACTION_LABELS[a.action_type]} · {a.moderator_name} · {timeAgo(a.created_at)}
            </p>
            {a.details}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={actionType}
          onChange={(e) => setActionType(e.target.value as ReportActionType)}
          className="admin-input w-40 text-xs"
        >
          <option value="warning">Warning</option>
          <option value="remove_content">Remove content</option>
          <option value="suspend_user">Suspend user</option>
          <option value="ban_user">Ban user</option>
        </select>
        {actionType === "suspend_user" && (
          <input
            type="number"
            min={1}
            max={3650}
            value={banDays}
            onChange={(e) => setBanDays(e.target.value)}
            className="admin-input w-20 text-xs"
            title="Suspension length in days"
          />
        )}
        <input
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Optional note about this action…"
          className="admin-input flex-1 text-xs"
        />
        <button
          type="button"
          disabled={saving}
          onClick={submit}
          className="glow-yellow-button rounded-full bg-[var(--color-menu-bg)] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          Record
        </button>
      </div>
      {error && <p className="mt-1 text-xs font-medium text-hot">{error}</p>}
    </div>
  );
}

function ReportAudit({ reportId }: { reportId: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ReportAuditEntryRow[] | null>(null);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      if (next && entries === null) {
        fetchReportAuditAdmin(reportId)
          .then(setEntries)
          .catch(() => setEntries([]));
      }
      return next;
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-faint hover:text-white"
      >
        <HistoryIcon size={13} /> Audit log {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-1.5">
          {entries === null && <Loader2 size={14} className="animate-spin text-text-faint" />}
          {entries?.length === 0 && <p className="text-xs text-text-faint">No audit entries yet.</p>}
          {entries?.map((e) => (
            <div key={e.id} className="text-xs text-text-faint">
              <span className="font-semibold text-white/70">{e.actor_name}</span> {e.action.replace(/_/g, " ")} ·{" "}
              {timeAgo(e.created_at)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateReportForm({
  defaultKind,
  defaultReason,
  categories,
  onCreated,
  onCancel,
}: {
  defaultKind: ReportKind;
  defaultReason?: string;
  categories: ReportCategoryRow[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<ReportKind>(defaultKind);
  const [reason, setReason] = useState(defaultReason ?? "spam");
  const [reportedUserId, setReportedUserId] = useState("");
  const [claimantName, setClaimantName] = useState("");
  const [claimantEmail, setClaimantEmail] = useState("");
  const [infringingUrl, setInfringingUrl] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createReportAdmin({
        kind,
        reason: kind === "user" ? reason : undefined,
        reportedUserId: kind === "user" && reportedUserId ? reportedUserId : undefined,
        details,
        claimantName: kind !== "user" ? claimantName : undefined,
        claimantEmail: kind !== "user" ? claimantEmail : undefined,
        infringingUrl: kind !== "user" ? infringingUrl : undefined,
        copyrightedWorkDescription: kind !== "user" ? workDescription : undefined,
        categoryKey: categories.find((c) => c.key === (kind === "user" ? reason : kind))?.key,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log case.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass mb-4 rounded-xl p-4">
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!defaultKind || defaultKind === "user" ? (
          <label className="text-xs text-text-faint">
            <span className="mb-1 block font-semibold text-white/80">Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as ReportKind)} className="admin-input w-full">
              <option value="user">User / abuse report</option>
              <option value="copyright">Copyright claim</option>
              <option value="dmca">DMCA takedown</option>
              <option value="counter_notice">Counter-notice</option>
            </select>
          </label>
        ) : null}
        {kind === "user" ? (
          <>
            <label className="text-xs text-text-faint">
              <span className="mb-1 block font-semibold text-white/80">Reason</span>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="admin-input w-full">
                <option value="spam">Spam</option>
                <option value="harassment">Harassment / Hate speech</option>
                <option value="inappropriate_content">Inappropriate content</option>
                <option value="impersonation">Impersonation</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="text-xs text-text-faint">
              <span className="mb-1 block font-semibold text-white/80">Reported user ID (optional)</span>
              <input
                value={reportedUserId}
                onChange={(e) => setReportedUserId(e.target.value)}
                placeholder="uuid"
                className="admin-input w-full"
              />
            </label>
          </>
        ) : (
          <>
            <label className="text-xs text-text-faint">
              <span className="mb-1 block font-semibold text-white/80">Claimant name</span>
              <input
                value={claimantName}
                onChange={(e) => setClaimantName(e.target.value)}
                required
                className="admin-input w-full"
              />
            </label>
            <label className="text-xs text-text-faint">
              <span className="mb-1 block font-semibold text-white/80">Claimant email</span>
              <input
                type="email"
                value={claimantEmail}
                onChange={(e) => setClaimantEmail(e.target.value)}
                className="admin-input w-full"
              />
            </label>
            <label className="text-xs text-text-faint">
              <span className="mb-1 block font-semibold text-white/80">Infringing URL</span>
              <input
                value={infringingUrl}
                onChange={(e) => setInfringingUrl(e.target.value)}
                className="admin-input w-full"
              />
            </label>
            <label className="text-xs text-text-faint sm:col-span-2">
              <span className="mb-1 block font-semibold text-white/80">Copyrighted work description</span>
              <input
                value={workDescription}
                onChange={(e) => setWorkDescription(e.target.value)}
                className="admin-input w-full"
              />
            </label>
          </>
        )}
      </div>
      <label className="mb-3 block text-xs text-text-faint">
        <span className="mb-1 block font-semibold text-white/80">Details</span>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={2}
          className="admin-input w-full"
        />
      </label>
      {error && <p className="mb-2 text-xs font-medium text-hot">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="glow-yellow-button flex items-center gap-2 rounded-full bg-[var(--color-menu-bg)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving && <Loader2 size={14} className="animate-spin" />}
          Log case
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="glass rounded-full px-4 py-2 text-sm font-semibold text-white/80 hover:text-white"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
