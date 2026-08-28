import { HeartHandshake } from "lucide-react";
import { StaticPage } from "@/components/StaticPage";
import { RichContent } from "@/components/RichContent";
import { getPageBySlug } from "@/lib/content-server";

export const metadata = { title: "Parents Info — MofiGames" };

// Editable at Admin → Content Management → Pages → "Parents Info" (seeded
// by supabase/migrations/0025_copyright_and_parents_page.sql at the fixed
// slug "parents-info"). The block below is only a fallback for the rare
// case that row is missing — e.g. a fresh database before that migration
// has been run — so the page never renders empty.
const FALLBACK_CONTENT = `
  <p>Thanks for taking a moment to learn about the site your child is using. Here's a quick overview.</p>
  <h2>What this site is</h2>
  <p>MofiGames is a browser-based games portal organized into categories like action, puzzle, sports, and strategy. Games run directly in the browser — no downloads or installs.</p>
  <h2>Accounts and personal data</h2>
  <p>This build doesn't collect accounts or personal information. If that changes in the future, our Privacy Policy will be updated to reflect exactly what's collected and why.</p>
  <h2>Chat and multiplayer</h2>
  <p>Some games are categorized as Multiplayer. If any embedded game includes chat or voice features, that functionality is controlled by the game's own provider, not by MofiGames — we'd recommend reviewing those features directly.</p>
  <h2>Recommended settings</h2>
  <p>Consider using your device or browser's built-in parental controls and screen-time tools alongside this site, especially for younger children.</p>
  <h2>Questions or concerns</h2>
  <p>Reach out any time through the Contact Us page — we're happy to help.</p>
`;

export default async function ParentsInfoPage() {
  const page = await getPageBySlug("parents-info");

  return (
    <StaticPage title="Information for Parents" icon={HeartHandshake} subtitle="What you should know about MofiGames">
      <RichContent html={page?.content?.trim() || FALLBACK_CONTENT} />
    </StaticPage>
  );
}
