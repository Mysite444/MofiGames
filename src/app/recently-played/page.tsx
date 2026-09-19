import { RecentlyPlayedPageClient } from "@/components/RecentlyPlayedPageClient";

export const metadata = {
  title: "Recently Played — MofiGames",
  description: "Pick up right where you left off — your recently played games on this device.",
};

export default function RecentlyPlayedPage() {
  return <RecentlyPlayedPageClient />;
}
