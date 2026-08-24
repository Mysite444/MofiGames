"use client";

import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { useNotifications, type AppNotification } from "@/lib/notifications";

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return `${Math.floor(day / 7)}w ago`;
}

function NotificationRow({ item, onNavigate }: { item: AppNotification; onNavigate?: () => void }) {
  const inner = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/10">
        {item.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Gamepad2 size={18} className="text-text-faint" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">{item.title}</span>
        {item.message && <span className="block truncate text-xs text-text-muted">{item.message}</span>}
        <span className="block text-[11px] text-text-faint">{timeAgo(item.createdAt)}</span>
      </span>
    </>
  );

  const rowClass = "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors";

  if (item.link) {
    return (
      <Link href={item.link} onClick={onNavigate} className={`${rowClass} hover:bg-white/10`}>
        {inner}
      </Link>
    );
  }
  return <div className={rowClass}>{inner}</div>;
}

/**
 * The notification feed itself — a public, site-wide "what's new" list
 * (currently just newly-published games), shared between the desktop
 * header dropdown and the mobile notifications sheet so both stay
 * identical by construction. Real data via lib/notifications.ts / GET
 * /api/notifications, not a static placeholder.
 */
export function NotificationsList({ onNavigate }: { onNavigate?: () => void }) {
  const items = useNotifications();

  if (items.length === 0) {
    return <p className="px-2.5 py-2 text-sm text-text-muted">You&apos;re all caught up — no new notifications right now.</p>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => (
        <NotificationRow key={item.id} item={item} onNavigate={onNavigate} />
      ))}
    </div>
  );
}
