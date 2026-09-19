// The [slug] route handles games, categories, tags, and CMS pages.
// Games are the primary and highest-traffic content type, so the game
// page skeleton is the most appropriate loading fallback here. Category
// and page loads are typically fast enough that the skeleton resolves
// before it's even visible.
import { GamePageSkeleton } from "@/components/skeletons/GamePageSkeleton";

export default function Loading() {
  return <GamePageSkeleton />;
}
