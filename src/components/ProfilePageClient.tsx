"use client";

import { useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  User,
  LogIn,
  UserPlus,
  Pencil,
  Check,
  X,
  LogOut,
  Gamepad2,
  Clock,
  Bookmark,
  Award,
  Calendar,
  Sparkles,
  ArrowRight,
  Trophy,
  Trash2,
  Zap,
  Lock,
  Flame,
  Globe,
  Users,
  Target,
  Music2,
  Brain,
  Crown,
  Shield,
  RefreshCw,
  Star,
  Rocket,
} from "lucide-react";
import { Avatar } from "./Avatar";
import { SidebarPlayNextCard } from "./SidebarPlayNextCard";
import { ProfileSecuritySection } from "./ProfileSecuritySection";
import { useAuth } from "@/lib/auth-context";
import { hashSeed, mulberry32 } from "@/lib/prng";
import { useMergedGames } from "@/lib/games-merged";
import {
  useRecentlyPlayedSlugs,
  useFavoriteSlugs,
  useTotalPlaySeconds,
  clearRecentlyPlayed,
} from "@/lib/game-library";
import type { Game } from "@/lib/types";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatJoined(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  } catch {
    return "recently";
  }
}

/**
 * Formats a real seconds count (from useTotalPlaySeconds) for the "Hours
 * Played" stat card. Under an hour shows minutes instead of "0.2h" — a
 * brand-new account with 0 seconds correctly shows "0m", not a fake
 * pre-filled number.
 */
function formatPlayTime(totalSeconds: number): string {
  if (totalSeconds < 3600) return `${Math.round(totalSeconds / 60)}m`;
  return `${Math.round((totalSeconds / 3600) * 10) / 10}h`;
}

/**
 * Achievement-unlock count — still a per-account placeholder seeded off the
 * user id (stable across reloads, but not based on anything real). This is
 * the one stat this pass didn't convert: unlocking real achievements needs
 * actual per-achievement criteria decided first (e.g. what "Socialite" or
 * "Comeback" should really require), which is a separate follow-up. Games
 * Played and Hours Played below are both real now — see useTotalPlaySeconds
 * and recentlyPlayedSlugs.
 */
function achievementsFor(seed: string): number {
  const rng = mulberry32(hashSeed(seed));
  return Math.min(20, Math.floor(2 + rng() * 18));
}

// ─── achievement catalogue ───────────────────────────────────────────────────

type AchievementDef = {
  id: string;
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
  color: string;
};

const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-play",   label: "First Play",   Icon: Gamepad2, color: "#3DA9FC" },
  { id: "collector",    label: "Collector",    Icon: Bookmark, color: "#3DA9FC" },
  { id: "5-games",      label: "5 Games",      Icon: Star,     color: "#FFC857" },
  { id: "explorer",     label: "Explorer",     Icon: Globe,    color: "#34D399" },
  { id: "hot-streak",   label: "Hot Streak",   Icon: Flame,    color: "#FF6B2C" },
  { id: "strategist",   label: "Strategist",   Icon: Brain,    color: "#A78BFA" },
  { id: "10-games",     label: "10 Games",     Icon: Trophy,   color: "#FFC857" },
  { id: "speedster",    label: "Speed Run",    Icon: Zap,      color: "#22D3EE" },
  { id: "sharpshooter", label: "Sharpshooter", Icon: Target,   color: "#3DA9FC" },
  { id: "social",       label: "Socialite",    Icon: Users,    color: "#9146FF" },
  { id: "music-fan",    label: "Music Fan",    Icon: Music2,   color: "#F472B6" },
  { id: "defender",     label: "Defender",     Icon: Shield,   color: "#3DA9FC" },
  { id: "25-games",     label: "25 Games",     Icon: Crown,    color: "#FFC857" },
  { id: "comeback",     label: "Comeback",     Icon: RefreshCw,color: "#34D399" },
  { id: "rising-star",  label: "Rising Star",  Icon: Sparkles, color: "#9146FF" },
  { id: "50-games",     label: "50 Games",     Icon: Award,    color: "#FF4D5E" },
  { id: "dedicated",    label: "Dedicated",    Icon: Clock,    color: "#3DA9FC" },
  { id: "rocket",       label: "Rocketer",     Icon: Rocket,   color: "#FF6B2C" },
  { id: "hall-of-fame", label: "Hall of Fame", Icon: Star,     color: "#FFC857" },
  { id: "ultimate",     label: "Ultimate",     Icon: Crown,    color: "#FF4D5E" },
];

// ─── sub-components ──────────────────────────────────────────────────────────

function SignedOutPrompt() {
  return (
    <div className="flex flex-col items-center px-4 py-16 text-center sm:py-24 md:px-6">
      <div className="glass-strong flex h-20 w-20 items-center justify-center rounded-3xl">
        <User size={36} className="text-[var(--color-menu-blue)]" />
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold text-white">
        Create your profile
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-text-faint">
        Log in or sign up to track your game history, save favourites, unlock
        achievements, and more — all synced across your devices.
      </p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        <Link
          href="/login"
          className="glow-yellow-button flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-bold text-white"
        >
          <LogIn size={16} />
          Log In
        </Link>
        <Link
          href="/signup"
          className="glass flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white"
        >
          <UserPlus size={16} />
          Create Account
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  accent: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 rounded-2xl px-3 py-5 ring-1 ring-white/8 backdrop-blur"
      style={{ background: `${accent}0d` }}
    >
      <Icon size={20} style={{ color: accent }} />
      <span
        className="font-display text-2xl font-bold text-white"
        style={{ textShadow: `0 0 20px ${accent}70` }}
      >
        {value}
      </span>
      <span className="text-center text-[11px] leading-tight text-text-faint">{label}</span>
    </div>
  );
}

/**
 * Game thumbnail grid — uses the exact same SidebarPlayNextCard as the PC
 * "Play next" sidebar (16:9, title-at-bottom, hover video preview).
 */
function GameThumbGrid({ games }: { games: Game[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {games.map((game) => (
        <div key={game.id} className="aspect-video w-full">
          <SidebarPlayNextCard game={game} />
        </div>
      ))}
    </div>
  );
}

function SectionHeader({
  title,
  href,
  hrefLabel = "See all",
  onClear,
  icon,
}: {
  title: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  onClear?: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 font-display text-base font-bold leading-tight text-text md:text-lg">
        {icon}
        {title}
      </h2>
      <div className="flex items-center gap-1">
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-text-faint transition-colors hover:bg-hot/10 hover:text-hot"
          >
            <Trash2 size={12} />
            Clear
          </button>
        )}
        {href && (
          <Link
            href={href}
            className="flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            {hrefLabel}
            <ArrowRight size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  message,
  action,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  message: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="glass flex flex-col items-center gap-3 rounded-2xl py-12 text-center">
      <Icon size={28} className="text-text-faint" />
      <p className="max-w-xs text-sm text-text-faint">{message}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-1 flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/15"
        >
          {action.label}
          <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

// ─── loading skeleton ────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-4 pb-10 md:gap-8 md:px-6">
      <div className="h-60 animate-pulse rounded-3xl bg-white/5" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/5" />
        ))}
      </div>
      <div>
        <div className="mb-3 h-5 w-40 animate-pulse rounded-full bg-white/5" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-video animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── main export ─────────────────────────────────────────────────────────────

export function ProfilePageClient() {
  const { user, ready, logout, updateProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [saving, setSaving] = useState(false);
  const recentlyPlayedSlugs = useRecentlyPlayedSlugs();
  const favoriteSlugs = useFavoriteSlugs();
  const { games: allGames } = useMergedGames();
  const totalPlaySeconds = useTotalPlaySeconds(user?.id);

  if (!ready) return <ProfileSkeleton />;
  if (!user) return <SignedOutPrompt />;

  // ── data derivation ──────────────────────────────────────────────────
  // Games Played is the real distinct-games-played count — same list the
  // "Continue Playing" section below shows, so it's always consistent with
  // it, and it's genuinely 0 for a brand-new account (no fake baseline).
  const gamesPlayed = recentlyPlayedSlugs.length;
  // totalPlaySeconds (above) is null while still loading — rendered as
  // "—" further down rather than flashing "0m" first.
  const achievementsCount = achievementsFor(user.id);

  const bySlug = new Map(allGames.map((g) => [g.slug, g]));

  const continuePlaying = recentlyPlayedSlugs
    .slice(0, 8)
    .map((slug) => bySlug.get(slug))
    .filter((g): g is Game => Boolean(g));

  const favorites = favoriteSlugs
    .slice(0, 8)
    .map((slug) => bySlug.get(slug))
    .filter((g): g is Game => Boolean(g));

  const unlockedAchievements = ACHIEVEMENTS.slice(0, achievementsCount);
  const lockedCount = Math.max(0, 6 - achievementsCount);
  const lockedSlots = ACHIEVEMENTS.slice(achievementsCount, achievementsCount + lockedCount);

  // ── name editing ─────────────────────────────────────────────────────
  function startEditing() {
    setDraftName(user!.name);
    setEditing(true);
  }

  async function saveEditing() {
    const trimmed = draftName.trim();
    if (trimmed.length >= 2 && trimmed !== user!.name) {
      setSaving(true);
      try {
        await updateProfile({ name: trimmed });
      } finally {
        setSaving(false);
      }
    }
    setEditing(false);
  }

  return (
    <div className="flex flex-col gap-6 px-4 pb-12 md:gap-8 md:px-6">

      {/* ── HERO BANNER ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl">
        {/* Layered background */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(140deg, #0d0821 0%, #1b0a3e 45%, #0c1f4a 100%)",
          }}
        />
        {/* Ambient glow orbs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 -top-20 h-80 w-80 rounded-full"
          style={{
            background: "radial-gradient(circle, #FFC85755 0%, transparent 65%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -right-16 h-72 w-72 rounded-full"
          style={{ background: "radial-gradient(circle, #3DA9FC30 0%, transparent 65%)" }}
        />
        <Sparkles
          size={220}
          strokeWidth={0.6}
          className="pointer-events-none absolute right-0 top-0 -translate-y-1/3 translate-x-1/4 text-white/6"
          aria-hidden
        />

        <div className="relative px-6 pb-7 pt-7 sm:px-8 sm:pt-8">
          {/* Avatar row + sign-out */}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-5">
              {/* Avatar */}
              <div className="relative shrink-0">
                <Avatar
                  name={user.name}
                  size={80}
                  className="shadow-2xl shadow-black/70 ring-4 ring-white/20"
                />
              </div>

              <div className="min-w-0">
                {/* Editable display name */}
                {editing ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEditing();
                        if (e.key === "Escape") setEditing(false);
                      }}
                      className="input-glow rounded-xl bg-white/15 px-3 py-1.5 font-display text-xl font-bold text-white placeholder:text-white/50 focus:outline-none sm:text-2xl"
                      disabled={saving}
                    />
                    <button
                      type="button"
                      onClick={saveEditing}
                      disabled={saving}
                      aria-label="Save name"
                      className="rounded-full bg-[var(--color-menu-yellow)]/80 p-1.5 text-white transition-colors hover:bg-[var(--color-menu-yellow)]"
                    >
                      <Check size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      aria-label="Cancel"
                      className="rounded-full bg-white/10 p-1.5 text-white transition-colors hover:bg-white/20"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h1 className="truncate font-display text-xl font-bold text-white sm:text-2xl">
                      {user.name}
                    </h1>
                    <button
                      type="button"
                      onClick={startEditing}
                      aria-label="Edit display name"
                      className="shrink-0 rounded-full p-1.5 text-white/50 transition-colors hover:bg-white/15 hover:text-white"
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                )}

                <p className="truncate text-sm text-white/60">{user.email}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-white/40">
                  <Calendar size={11} />
                  Member since {formatJoined(user.joinedAt)}
                </p>
                {/* Bio is always rendered as a plain text node (never raw
                    HTML) — React escapes it automatically. Editing lives
                    in Account Settings below. */}
                {user.bio && (
                  <p className="mt-2 max-w-md whitespace-pre-wrap break-words text-sm text-white/70">
                    {user.bio}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              className="flex w-fit shrink-0 items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white/70 backdrop-blur transition-colors hover:bg-white/20 hover:text-white"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        </div>
      </section>

      {/* ── STATS GRID ──────────────────────────────────────────────────── */}
      <section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={Gamepad2}
            value={gamesPlayed.toLocaleString()}
            label="Games Played"
            accent="#3DA9FC"
          />
          <StatCard
            icon={Clock}
            value={totalPlaySeconds === null ? "—" : formatPlayTime(totalPlaySeconds)}
            label="Hours Played"
            accent="#9146FF"
          />
          <StatCard
            icon={Bookmark}
            value={favoriteSlugs.length.toLocaleString()}
            label="Bookmarks"
            accent="#3DA9FC"
          />
          <StatCard
            icon={Award}
            value={`${achievementsCount}/20`}
            label="Achievements"
            accent="#FFC857"
          />
        </div>
      </section>

      {/* ── CONTINUE PLAYING ────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Continue Playing"
          href="/recently-played"
          icon={<Zap size={16} className="text-[var(--color-menu-yellow)]" />}
          onClear={
            continuePlaying.length > 0
              ? () => clearRecentlyPlayed()
              : undefined
          }
        />
        {continuePlaying.length > 0 ? (
          <GameThumbGrid games={continuePlaying} />
        ) : (
          <EmptyState
            icon={Gamepad2}
            message="No games played yet. Start exploring and your history will show up here."
            action={{ href: "/", label: "Browse games" }}
          />
        )}
      </section>

      {/* ── FAVOURITES ──────────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          title="Favourites"
          href="/favorites"
          icon={<Bookmark size={15} className="fill-[#3DA9FC] text-[#3DA9FC]" />}
        />
        {favorites.length > 0 ? (
          <GameThumbGrid games={favorites} />
        ) : (
          <EmptyState
            icon={Bookmark}
            message="Nothing bookmarked yet. Tap the bookmark icon on any game to save it here."
            action={{ href: "/", label: "Browse games to bookmark" }}
          />
        )}
      </section>

      {/* ── ACHIEVEMENTS ────────────────────────────────────────────────── */}
      <section className="glass rounded-2xl p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
            <Award size={16} className="text-gold" />
            Achievements
          </h2>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-text-muted">
            {achievementsCount} / 20
          </span>
        </div>

        {/* Unlocked + next locked slots */}
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
          {unlockedAchievements.slice(0, 6).map((a) => {
            const AIcon = a.Icon;
            return (
              <div
                key={a.id}
                title={a.label}
                className="flex flex-col items-center gap-1.5 rounded-xl p-2.5 transition-colors hover:bg-white/5"
                style={{ background: `${a.color}10` }}
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full"
                  style={{
                    background: `${a.color}22`,
                    color: a.color,
                    boxShadow: `0 0 12px ${a.color}35`,
                  }}
                >
                  <AIcon size={18} />
                </span>
                <span className="text-center text-[10px] font-semibold leading-tight text-text-muted">
                  {a.label}
                </span>
              </div>
            );
          })}

          {/* Locked slots (fill row to 6) */}
          {lockedSlots.map((a) => (
            <div
              key={`locked-${a.id}`}
              title="Locked"
              className="flex flex-col items-center gap-1.5 rounded-xl p-2.5 opacity-30"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/8">
                <Lock size={16} className="text-white/40" />
              </span>
              <span className="text-[10px] font-semibold text-text-faint">Locked</span>
            </div>
          ))}
        </div>

        {/* If more than 6 unlocked, show the rest */}
        {unlockedAchievements.length > 6 && (
          <div className="mt-2.5 grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
            {unlockedAchievements.slice(6).map((a) => {
              const AIcon = a.Icon;
              return (
                <div
                  key={a.id}
                  title={a.label}
                  className="flex flex-col items-center gap-1.5 rounded-xl p-2.5 transition-colors hover:bg-white/5"
                  style={{ background: `${a.color}10` }}
                >
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-full"
                    style={{
                      background: `${a.color}22`,
                      color: a.color,
                      boxShadow: `0 0 12px ${a.color}35`,
                    }}
                  >
                    <AIcon size={18} />
                  </span>
                  <span className="text-center text-[10px] font-semibold leading-tight text-text-muted">
                    {a.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-3 text-xs text-text-faint">
          {achievementsCount < 20
            ? `${20 - achievementsCount} more achievement${20 - achievementsCount === 1 ? "" : "s"} to unlock — keep playing!`
            : "All achievements unlocked. You're a legend! 🏆"}
        </p>
      </section>

      {/* ── SECURITY ────────────────────────────────────────────────────── */}
      {user.email !== "Guest session" && <ProfileSecuritySection />}

      {/* ── ACCOUNT SETTINGS ────────────────────────────────────────────── */}
      <section className="glass flex flex-col gap-4 rounded-2xl p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-display text-base font-bold text-white">
          <User size={15} className="text-text-faint" />
          Account Settings
        </h2>

        {/* Display name */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-text-faint">Display name</span>
          <div className="glass-strong flex items-center gap-2.5 rounded-xl px-3.5 py-2.5">
            <User size={15} className="shrink-0 text-text-faint" />
            <input
              key={user.name}
              defaultValue={user.name}
              onBlur={(e) => {
                const trimmed = e.target.value.trim();
                if (trimmed.length >= 2 && trimmed !== user.name)
                  updateProfile({ name: trimmed });
              }}
              className="w-full bg-transparent text-sm text-white focus:outline-none"
            />
          </div>
        </div>

        {/* Bio */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-faint">Bio</span>
            <span className="text-[11px] text-text-faint">Max 300 characters</span>
          </div>
          <div className="glass-strong flex items-start gap-2.5 rounded-xl px-3.5 py-2.5">
            <textarea
              key={user.bio}
              defaultValue={user.bio}
              maxLength={300}
              rows={3}
              placeholder="Tell other players a bit about yourself…"
              onBlur={(e) => {
                const trimmed = e.target.value.trim();
                if (trimmed !== user.bio) updateProfile({ bio: trimmed });
              }}
              className="w-full resize-none bg-transparent text-sm text-white placeholder:text-text-faint focus:outline-none"
            />
          </div>
        </div>

        {/* Email (read-only) */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-text-faint">Email address</span>
          <div className="glass-strong flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 opacity-60">
            <span className="w-full truncate text-sm text-white">{user.email}</span>
          </div>
        </div>

        {/* Member since (read-only) */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-text-faint">Member since</span>
          <div className="glass-strong flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 opacity-60">
            <Calendar size={15} className="shrink-0 text-text-faint" />
            <span className="text-sm text-white">{formatJoined(user.joinedAt)}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          className="glass mt-1 flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm font-semibold text-hot transition-colors hover:bg-hot/10 sm:w-fit sm:px-8"
        >
          <LogOut size={15} />
          Sign Out
        </button>
      </section>
    </div>
  );
}
