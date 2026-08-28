import { AlertTriangle } from "lucide-react";
import { StaticPage } from "@/components/StaticPage";
import { RichContent } from "@/components/RichContent";
import { getPageBySlug } from "@/lib/content-server";

export const metadata = { title: "Disclaimer — MofiGames" };

// Editable at Admin → Content Management → Pages → "Disclaimer" (seeded by
// supabase/migrations/0026_more_editable_pages.sql at the fixed slug
// "disclaimer"). Fallback below only covers a fresh database before that
// migration has run.
const FALLBACK_CONTENT = `
  <h2>No warranty</h2>
  <p>Games and content on MofiGames are provided "as is" without warranties of any kind. We don't guarantee uninterrupted availability, accuracy, or that any game will be free of bugs.</p>
  <h2>Third-party games</h2>
  <p>Where games are sourced or embedded from third parties, MofiGames isn't responsible for their content, behavior, or any external links they may contain.</p>
  <h2>External links</h2>
  <p>Links to external sites are provided for convenience. We don't control and aren't responsible for the content of external sites.</p>
  <h2>Limitation of liability</h2>
  <p>To the fullest extent permitted by law, MofiGames isn't liable for any damages arising from use of the site.</p>
`;

export default async function DisclaimerPage() {
  const page = await getPageBySlug("disclaimer");

  return (
    <StaticPage title="Disclaimer" icon={AlertTriangle}>
      <RichContent html={page?.content?.trim() || FALLBACK_CONTENT} />
    </StaticPage>
  );
}
