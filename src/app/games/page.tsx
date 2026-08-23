import { Suspense } from "react";
import { GamesBrowseClient } from "@/components/GamesBrowseClient";
import { BrowsePageSkeleton } from "@/components/skeletons/BrowsePageSkeleton";

export const metadata = {
  title: "All Games — MofiGames",
  description:
    "Browse and search the entire MofiGames library. Filter by category, tags, platform, and game mode to find your next favorite game.",
};

export default function GamesPage() {
  return (
    <Suspense fallback={<BrowsePageSkeleton desktopColumns="6" bannerCount={0} gridCount={24} />}>
      <GamesBrowseClient />
    </Suspense>
  );
}
