import { ProfilePageClient } from "@/components/ProfilePageClient";
import { Require2FABanner } from "@/components/Require2FABanner";

export const metadata = {
  title: "My Profile — MofiGames",
  description: "Your MofiGames profile, stats, and saved games.",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ require_2fa?: string }>;
}) {
  const { require_2fa } = await searchParams;
  const show2FABanner = require_2fa === "1";

  return (
    <>
      {show2FABanner && <Require2FABanner />}
      <ProfilePageClient />
    </>
  );
}
