import { FileText } from "lucide-react";
import { StaticPage } from "@/components/StaticPage";
import { RichContent } from "@/components/RichContent";
import { getPageBySlug } from "@/lib/content-server";

export const metadata = { title: "Terms and Conditions — MofiGames" };

// Editable at Admin → Content Management → Pages → "Terms and Conditions"
// (seeded by supabase/migrations/0026_more_editable_pages.sql at the fixed
// slug "terms"). Fallback below only covers a fresh database before that
// migration has run.
const FALLBACK_CONTENT = `
  <p>By using MofiGames, you agree to these terms. Please read them before playing.</p>
  <h2>Use of the site</h2>
  <p>MofiGames is provided for personal, non-commercial entertainment. Don't use the site to distribute malware, scrape content at scale, or interfere with normal operation.</p>
  <h2>Accounts</h2>
  <p>If accounts are added later, you're responsible for keeping your credentials secure and for activity under your account.</p>
  <h2>Content ownership</h2>
  <p>Games featured on the site remain the property of their respective creators or publishers. Site design, branding, and original text belong to MofiGames.</p>
  <h2>Changes</h2>
  <p>These terms may be updated from time to time; continued use means you accept the changes.</p>
`;

export default async function TermsPage() {
  const page = await getPageBySlug("terms");

  return (
    <StaticPage title="Terms and Conditions" icon={FileText} subtitle="Last updated: placeholder date">
      <RichContent html={page?.content?.trim() || FALLBACK_CONTENT} />
    </StaticPage>
  );
}
