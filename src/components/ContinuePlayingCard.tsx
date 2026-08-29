import Link from "next/link";
import { GameThumbnail } from "./GameThumbnail";
import { getCategoryBySlug } from "@/lib/categories";
import { getGameCover } from "@/lib/game-cover";
import type { Game } from "@/lib/types";

const tagStyles: Record<string, string> = {
  TOP: "bg-gold text-[#221a00]",
  HOT: "bg-hot text-white",
  NEW: "glass-strong text-white",
  UPDATED: "glass-strong text-white",
};

// A single small, captionless thumbnail — matches the size/design of the
// reference's "Continue playing" thumb, instead of a full scrollable row of
// regular-sized GameCards. The 88×88px container is square, so we use the
// square cover (1:1 aspect ratio) to avoid cropping important artwork.
export function ContinuePlayingCard({ game }: { game: Game }) {
  const category = getCategoryBySlug(game.categorySlug);
  // Square cover (1:1) matches this 88×88px tile — falls back to
  // thumbnailUrl → coverImageUrl → gradient placeholder.
  const imageSrc = getGameCover(game, "square");
  if (!imageSrc && !category) return null;

  return (
    <Link
      href={`/${game.slug}`}
      className="tile-shine group relative block h-[88px] w-[88px] overflow-hidden rounded-xl ring-1 ring-white/10 transition-all duration-200 hover:scale-[1.05] hover:ring-2 hover:ring-[rgba(0,0,0,0.5)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,0,0,0.5)] active:scale-[0.96]"
    >
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <GameThumbnail category={category!} variant={game.variant} className="absolute inset-0 h-full w-full" />
      )}

      {game.tag && (
        <span
          className={`absolute left-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide transition-opacity duration-200 group-hover:opacity-0 ${tagStyles[game.tag]}`}
        >
          {game.tag}
        </span>
      )}
    </Link>
  );
}
