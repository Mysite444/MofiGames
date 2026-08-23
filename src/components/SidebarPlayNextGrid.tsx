import { SidebarPlayNextCard } from "./SidebarPlayNextCard";
import type { Game } from "@/lib/types";

// Fixed exact size for the sidebar tile: full 300px sidebar width (flush
// with the 300x250 ad slot above/below it) at a 16:9 ratio — pixel-matched
// to the single-column "Play next" tile on the CrazyGames reference
// screenshot, rather than the old 2-column/146px tile size.
const SIDEBAR_CARD_SIZE = { width: "300px", height: "169px" };

/**
 * The "Play next" sidebar block — one column, 30 tiles, each using
 * SidebarPlayNextCard so a short muted preview clip autoplays over the
 * thumbnail on hover (matching the CrazyGames-style video-preview
 * behavior). Desktop/laptop only, sized to sit directly under the 300x250
 * ad slot.
 */
export function SidebarPlayNextGrid({ title, games }: { title: string; games: Game[] }) {
  const posts = games.slice(0, 30);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-sm font-bold text-text">{title}</h2>
      <div className="flex flex-col gap-3">
        {posts.map((game) => (
          <div key={game.id} style={SIDEBAR_CARD_SIZE} className="shrink-0">
            <SidebarPlayNextCard game={game} />
          </div>
        ))}
      </div>
    </div>
  );
}
