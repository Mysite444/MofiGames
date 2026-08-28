import { Baby } from "lucide-react";
import { StaticPage } from "@/components/StaticPage";
import { RichContent } from "@/components/RichContent";
import { getPageBySlug } from "@/lib/content-server";

export const metadata = { title: "A Message for Kids — MofiGames" };

// Editable at Admin → Content Management → Pages → "A Message for Kids"
// (seeded by supabase/migrations/0026_more_editable_pages.sql at the fixed
// slug "kids-message"). Fallback below only covers a fresh database before
// that migration has run.
const FALLBACK_CONTENT = `
  <p>We're glad you're having fun on MofiGames! Here are a few friendly reminders:</p>
  <h2>Take breaks</h2>
  <p>Stand up, stretch, and rest your eyes every so often. Games will still be here when you're back.</p>
  <h2>Keep your info private</h2>
  <p>Never share your full name, address, school, or password with anyone online — not even in a game. If something ever asks you to, check with a parent or guardian first.</p>
  <h2>Ask a grown-up</h2>
  <p>If anything online makes you feel confused, uncomfortable, or worried, tell a parent, guardian, or teacher right away. You won't be in trouble for asking.</p>
  <h2>Be kind</h2>
  <p>If a game lets you play with others, be a good sport — win or lose.</p>
`;

export default async function KidsMessagePage() {
  const page = await getPageBySlug("kids-message");

  return (
    <StaticPage title="A Message for Kids" icon={Baby} subtitle="Hey, thanks for playing!">
      <RichContent html={page?.content?.trim() || FALLBACK_CONTENT} />
    </StaticPage>
  );
}
