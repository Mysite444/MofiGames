import Link from "next/link";
import { RefreshCw, Sparkles, Trophy, Flame } from "lucide-react";
import { GameThumbnail } from "./GameThumbnail";
import { getCategoryBySlug } from "@/lib/categories";
import { getGameCover } from "@/lib/game-cover";
import type { Game, Tag } from "@/lib/types";

// Bigger, bolder badge than the regular GameCard tag — closer to the chunky
// "Updated" / "Top" pills CrazyGames puts on its Originals tiles.
const badgeStyles: Record<Exclude<Tag, null>, string> = {
  TOP: "bg-gold text-[#221a00]",
  HOT: "bg-hot text-white",
  NEW: "bg-[var(--color-menu-blue)] text-white",
  UPDATED: "glass-strong text-white",
};

const badgeIcons: Record<Exclude<Tag, null>, typeof RefreshCw> = {
  TOP: Trophy,
  HOT: Flame,
  NEW: Sparkles,
  UPDATED: RefreshCw,
};

// Splits a generated title into a "wordmark": every word white except the
// last, which picks up the gold accent — mimicking the two-tone logo
// lettering baked into CrazyGames' own Originals artwork (BLOCK / BLASTER,
// CRAZY / OFFICE, etc.) without needing real custom artwork per game.
function Wordmark({ title }: { title: string }) {
  const words = title.trim().split(/\s+/);
  const last = words.pop();
  return (
    <p className="font-display text-[18px] font-bold uppercase leading-[1.02] tracking-tight text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)] lg:text-[19px]">
      {words.length > 0 && <span>{words.join(" ")} </span>}
      <span className="text-gold">{last}</span>
    </p>
  );
}

/**
 * Tile for the "MofiGames Originals" rail — desktop/laptop only. Fixed
 * exact size (set by the parent wrapper in CategoryRow: 202px x 304px,
 * measured directly off the CrazyGames Originals tiles), no caption row
 * underneath (title lives on the art itself, like a logo), and a chunkier
 * corner badge. Hover shows a thick white ring, same as every other card
 * on the site — no lift, no play-button overlay.
 *
 * Uses the portrait cover (2:3, 800×1200) so the full artwork is visible
 * without object-fit cropping characters/logos from the top or sides.
 */
export function OriginalsGameCard({ game }: { game: Game }) {
  const category = getCategoryBySlug(game.categorySlug);
  // Portrait cover (2:3) matches this 202×304px tile exactly — falls back to
  // thumbnailUrl → coverImageUrl → gradient placeholder.
  const imageSrc = getGameCover(game, "portrait");
  if (!imageSrc && !category) return null;

  const BadgeIcon = game.tag ? badgeIcons[game.tag] : null;

  return (
    <Link href={`/${game.slug}`} className="group block h-full w-full focus-visible:outline-none">
      <div className="tile-shine relative h-full w-full overflow-hidden rounded-xl ring-1 ring-white/10 transition-all duration-200 group-hover:scale-[1.03] group-hover:ring-2 group-hover:ring-[rgba(0,0,0,0.5)] group-hover:shadow-[0_6px_20px_rgba(0,0,0,0.4)] group-focus-visible:ring-2 group-focus-visible:ring-[rgba(0,0,0,0.5)] group-active:scale-[0.97]">
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <GameThumbnail category={category!} variant={game.variant} className="absolute inset-0 h-full w-full" />
        )}

        {/* Stronger bottom fade than the small grid cards — needed so the
            wordmark text stays legible sitting directly on the art. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" aria-hidden />

        {game.tag && BadgeIcon && (
          <span
            className={`absolute left-2 top-2 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide transition-opacity duration-200 group-hover:opacity-0 group-active:opacity-0 ${badgeStyles[game.tag]}`}
          >
            <BadgeIcon size={11} strokeWidth={2.5} />
            {game.tag}
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 p-3">
          <Wordmark title={game.title} />
        </div>
      </div>
    </Link>
  );
}
