import { Mail } from "lucide-react";
import { StaticPage } from "@/components/StaticPage";
import { RichContent } from "@/components/RichContent";
import { ContactFormClient } from "@/components/ContactFormClient";
import { getPageBySlug } from "@/lib/content-server";

export const metadata = { title: "Contact Us — MofiGames" };

// Editable at Admin → Content Management → Pages → "Contact Us" (seeded by
// supabase/migrations/0026_more_editable_pages.sql at the fixed slug
// "contact"). Fallback below only covers a fresh database before that
// migration has run.
const FALLBACK_CONTENT = `
  <p>We'd love to hear from you. Fill in the form below or reach out through any of the channels listed here.</p>
  <ul><li><strong>Email:</strong> support@mofigames.com</li><li><strong>Live chat:</strong> Coming soon</li></ul>
  <h2>Response time</h2>
  <p>We typically reply within 1–2 business days.</p>
`;

export default async function ContactPage() {
  const page = await getPageBySlug("contact");

  return (
    <StaticPage title="Contact Us" icon={Mail} subtitle="Questions, feedback, or a bug to report?">
      <RichContent html={page?.content?.trim() || FALLBACK_CONTENT} />
      {/* Validated + rate-limited contact form — server-side enforcement in
          /api/contact/route.ts: honeypot, Zod schema, 5/hr IP, 3/hr email. */}
      <ContactFormClient />
    </StaticPage>
  );
}
