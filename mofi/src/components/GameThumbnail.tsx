import { iconMap } from "@/lib/icon-map";
import type { Category } from "@/lib/types";

const patterns = [
  "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.18) 1px, transparent 0)",
  "repeating-linear-gradient(45deg, rgba(255,255,255,0.10) 0 10px, transparent 10px 22px)",
  "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.22), transparent 40%), radial-gradient(circle at 85% 75%, rgba(0,0,0,0.20), transparent 45%)",
  "repeating-radial-gradient(circle at 70% 30%, rgba(255,255,255,0.14) 0 6px, transparent 6px 16px)",
  "linear-gradient(rgba(255,255,255,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.10) 1px, transparent 1px)",
  "repeating-linear-gradient(135deg, rgba(0,0,0,0.16) 0 14px, transparent 14px 28px)",
];
const patternSizes = ["12px 12px", "auto", "auto", "auto", "22px 22px", "auto"];
const rotations = [-8, 6, -4, 10, -10, 4];

export function GameThumbnail({
  category,
  variant,
  className = "",
  showIcon = true,
}: {
  category: Category;
  variant: number;
  className?: string;
  /** Set false to render just the gradient/pattern art with no category
   *  icon on top — used on the home page's Top Picks tiles to match
   *  CrazyGames' clean, icon-free thumbnails. Defaults to true so every
   *  other call site (game pages, search, mobile, etc.) is unaffected. */
  showIcon?: boolean;
}) {
  const Icon = iconMap[category.icon];
  const v = variant % 6;

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${category.colorFrom}, ${category.colorTo})` }}
    >
      <div
        className="absolute inset-0"
        style={{ backgroundImage: patterns[v], backgroundSize: patternSizes[v] }}
        aria-hidden
      />
      {showIcon && (
        <>
          <div
            className="absolute -right-4 -bottom-5 opacity-20"
            style={{ transform: `rotate(${rotations[v] * 2}deg)` }}
            aria-hidden
          >
            <Icon size={96} color="#fff" strokeWidth={1.4} />
          </div>
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ transform: `rotate(${rotations[v]}deg)` }}
            aria-hidden
          >
            <Icon
              size={44}
              color="#fff"
              strokeWidth={1.75}
              style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.35))" }}
            />
          </div>
        </>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/5" aria-hidden />
    </div>
  );
}
