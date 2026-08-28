import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { iconMap } from "@/lib/icon-map";
import { GameCard } from "./GameCard";
import { GameThumbnail } from "./GameThumbnail";
import { getCategoryBySlug } from "@/lib/categories";
import { getGameCover } from "@/lib/game-cover";
import type { Game, IconName } from "@/lib/types";

const tagStyles: Record<string, string> = {
  TOP: "bg-gold text-[#221a00]",
  HOT: "bg-hot text-white",
  NEW: "glass-strong text-white",
  UPDATED: "glass-strong text-white",
};

const headerBgStyles: Record<string, string> = {
  gold: "bg-gradient-to-r from-[#3a2a08] via-[#2a1f0a] to-transparent",
  blue: "bg-gradient-to-r from-[#0d2740] via-[#0c1f33] to-transparent",
};

function PortraitCard({ game }: { game: Game }) {
  const category = getCategoryBySlug(game.categorySlug);
  // Portrait cover (2:3) matches this aspect-[2/3] 128px-wide tile — falls
  // back to thumbnailUrl → coverImageUrl → gradient placeholder.
  const imageSrc = getGameCover(game, "portrait");
  if (!imageSrc && !category) return null;

  return (
    <Link
      href={`/${game.slug}`}
      className="tile-shine group relative block aspect-[2/3] w-[128px] shrink-0 snap-card overflow-hidden rounded-xl ring-1 ring-white/10 transition-all duration-200 active:scale-[0.97] hover:scale-[1.02] hover:ring-2 hover:ring-[rgba(145,70,255,0.5)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <GameThumbnail category={category!} variant={game.variant} className="absolute inset-0 h-full w-full" />
      )}
      {game.tag && (
        <span
          className={`absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide transition-opacity duration-200 group-hover:opacity-0 group-active:opacity-0 ${tagStyles[game.tag]}`}
        >
          {game.tag}
        </span>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" aria-hidden />
      <div className="absolute inset-x-2 bottom-2">
        <p className="truncate text-xs font-bold leading-tight text-white">{game.title}</p>
        <p className="truncate text-[10px] text-white/65">{category?.name}</p>
      </div>
    </Link>
  );
}

export function MobileGameRow({
  title,
  icon,
  accent,
  games,
  viewMoreHref,
  cardSize = "square",
  scroll = true,
  headerBg,
}: {
  title: string;
  icon: IconName;
  accent: string;
  games: Game[];
  viewMoreHref?: string;
  cardSize?: "square" | "portrait";
  scroll?: boolean;
  headerBg?: "gold" | "blue";
}) {
  const Icon = iconMap[icon];
  if (games.length === 0) return null;

  return (
    <section>
      <div className={headerBg ? `${headerBgStyles[headerBg]} py-3` : ""}>
        <div className="flex items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: `${accent}26`, color: accent }}
            >
              <Icon size={16} strokeWidth={2} />
            </span>
            <h2 className="font-category-fat text-[17px] leading-tight text-white">{title}</h2>
          </div>
          {viewMoreHref && (
            <Link href={viewMoreHref} className="flex items-center gap-1 text-[13px] font-semibold text-text-muted">
              See all
              <ArrowRight size={12} />
            </Link>
          )}
        </div>
      </div>

      {scroll ? (
        <div className="snap-rail scrollbar-hide mt-1 flex gap-2.5 overflow-x-auto pt-2 pb-2 pl-4">
          {cardSize === "portrait"
            ? games.map((g) => <PortraitCard key={g.id} game={g} />)
            : games.map((g) => (
                <div key={g.id} className="w-[84px] shrink-0 snap-card min-[400px]:w-[92px]">
                  <GameCard game={g} />
                </div>
              ))}
          <div className="w-2 shrink-0" aria-hidden />
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2.5 px-4">
          {games.map((g) => (
            <div key={g.id} className="w-[84px] min-[400px]:w-[92px]">
              <GameCard game={g} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
