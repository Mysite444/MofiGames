import { getMobileHomepageSections } from "@/lib/mobile-homepage-server";
import { ContinuePlayingMobile } from "./ContinuePlayingSection";
import { BackToTopButton } from "./BackToTopButton";
import { MobileTemplateRenderer } from "./mobile/MobileTemplateRenderer";
import type { Game, Category } from "@/lib/types";

/**
 * MobileHome — CMS-driven mobile homepage (server component).
 *
 * Architecture:
 *  • ContinuePlayingMobile is ALWAYS first and is NEVER configurable from
 *    the CMS — it is hard-wired here as instructed. Do not move it.
 *  • Every other section is driven by the `mobile_homepage_sections` table.
 *    Admin: Homepage → Mobile Homepage.
 *  • Templates 1-5 are selected per-section from the admin panel.
 *  • Games are resolved at render time from the same realGames/realCategories
 *    arrays the PC homepage fetches — shared data, mobile presentation.
 *  • `country` is forwarded for future personalisation (TopPicks parity)
 *    but is not currently consumed by any mobile template.
 */
export async function MobileHome({
  realGames = [],
  realCategories = [],
  country: _country,
}: {
  realGames?: Game[];
  realCategories?: Category[];
  country?: string | null;
}) {
  // Fetch enabled sections ordered by position.
  // Fragment-cached in mobile-homepage-server; falls back to [] on error.
  const sections = await getMobileHomepageSections();

  return (
    <div className="flex flex-col gap-5 pb-2">
      {/* ── Continue Playing — ALWAYS first, NEVER removed ── */}
      <ContinuePlayingMobile />

      {/* ── CMS-driven sections ── */}
      {sections.map((section) => (
        <MobileTemplateRenderer
          key={section.id}
          section={section}
          realGames={realGames}
          realCategories={realCategories}
        />
      ))}

      <BackToTopButton />
    </div>
  );
}
