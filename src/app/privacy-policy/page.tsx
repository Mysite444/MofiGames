import { ShieldCheck } from "lucide-react";
import { StaticPage } from "@/components/StaticPage";
import { RichContent } from "@/components/RichContent";
import { getPageBySlug } from "@/lib/content-server";

export const metadata = { title: "Privacy Policy — MofiGames" };

// Editable at Admin → Content Management → Pages → "Privacy Policy"
// (seeded by supabase/migrations/0026_more_editable_pages.sql at the fixed
// slug "privacy-policy"). Fallback below only covers a fresh database
// before that migration has run.
const FALLBACK_CONTENT = `
  <p>This Privacy Policy explains what information MofiGames collects, how it's used, and the choices available to you.</p>
  <h2>Information we collect</h2>
  <p>Depending on how the site is built out, this may include technical data (browser type, device, IP address), usage data (pages visited, games played), and any information you submit directly, such as through a contact form.</p>
  <h2>How we use it</h2>
  <p>To operate and improve the site, understand which games are popular, fix bugs, and respond to support requests.</p>
  <h2>Cookies</h2>
  <p>The site may use cookies or similar local storage to remember preferences and measure traffic. You can usually control cookies through your browser settings.</p>
  <h2>Third parties</h2>
  <p>If games are embedded from third-party providers, those providers may have their own privacy practices — review their policies separately.</p>
  <h2>Children's privacy</h2>
  <p>If this site is intended for or likely to be used by children, additional legal obligations apply in most regions (for example COPPA in the U.S. or GDPR-K in the EU/UK). These requirements need dedicated legal review.</p>
  <h2>Contact</h2>
  <p>Questions about this policy can be sent via the Contact Us page.</p>
`;

export default async function PrivacyPolicyPage() {
  const page = await getPageBySlug("privacy-policy");

  return (
    <StaticPage title="Privacy Policy" icon={ShieldCheck} subtitle="Last updated: placeholder date">
      <RichContent html={page?.content?.trim() || FALLBACK_CONTENT} />
    </StaticPage>
  );
}
