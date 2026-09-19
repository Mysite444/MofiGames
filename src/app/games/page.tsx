import { Suspense } from "react";
import { GamesBrowseClient } from "@/components/GamesBrowseClient";
import { BrowsePageSkeleton } from "@/components/skeletons/BrowsePageSkeleton";

// The page shell itself has zero server data fetching — GamesBrowseClient
// is a "use client" component that loads game data via the API after hydration.
// force-static makes this explicit: the HTML shell is pre-rendered once at
// build time and served from CDN permanently. Only the client-side JS fetch
// inside GamesBrowseClient ever hits the server, and it's rate-limited by
// the component's own debounce/pagination logic.
export const dynamic = "force-static";

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
