import { Info } from "lucide-react";
import { StaticPage } from "@/components/StaticPage";
import { RichContent } from "@/components/RichContent";
import { getPageBySlug } from "@/lib/content-server";

export const metadata = { title: "About Us — MofiGames" };

// Editable at Admin → Content Management → Pages → "About Us" (seeded by
// supabase/migrations/0026_more_editable_pages.sql at the fixed slug
// "about"). Fallback below only covers a fresh database before that
// migration has run.
const FALLBACK_CONTENT = `
  <p>MofiGames is a free browser gaming portal. No downloads, no installs — pick a category, click a game, and play straight from your browser on desktop, tablet, or phone.</p>
  <h2>What we offer</h2>
  <p>Our catalog spans hundreds of games across dozens of categories, from quick arcade rounds to longer strategy and simulation sessions.</p>
  <h2>Our mission</h2>
  <p>Keep casual gaming simple: fast loading pages, a clean catalog, and no clutter between you and the games you want to play.</p>
`;

export default async function AboutPage() {
  const page = await getPageBySlug("about");

  return (
    <StaticPage title="About Us" icon={Info} subtitle="Who's behind MofiGames">
      <RichContent html={page?.content?.trim() || FALLBACK_CONTENT} />
    </StaticPage>
  );
}
