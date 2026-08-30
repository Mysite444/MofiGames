import { sanitizeContentHtml } from "@/lib/sanitize-html";

/**
 * Renders a game's long-form "arranged content" — the How to Play / Tips /
 * Features / FAQ style article body authored in the admin panel's
 * RichTextEditor (see GamesAdminClient's "Content" field) — with real
 * heading, paragraph, and list structure, instead of the flat, unbroken
 * paragraph the page used to render `game.description` as.
 *
 * Pure typography here — no card/border of its own. The boxed "board"
 * panel CrazyGames wraps its whole content block in (see the reference
 * screenshots) is applied one level up, around this component *together
 * with* the intro blurb and "How to play" text (GameDetailsSection /
 * MobileGamePage), so the intro paragraph, headings, and lists all sit
 * inside one shared card instead of this piece floating in its own box
 * underneath a separate, unboxed intro paragraph.
 *
 * Shared between GameDetailsSection (desktop) and MobileGamePage (mobile)
 * so both surfaces render identically arranged, identically boxed content.
 *
 * Renders nothing when the game has no authored content yet, same as
 * CategoryContentSection does for categories without content.
 */
export function GameContentSection({ html, className = "" }: { html?: string; className?: string }) {
  if (!html || html.trim().length === 0) return null;

  return (
    <div
      className={`flex flex-col gap-3 text-sm leading-relaxed text-text-muted [&_h2]:mt-2 [&_h2]:font-display [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-text [&_h3]:mt-1 [&_h3]:font-display [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-text [&_p]:leading-relaxed [&_strong]:text-text [&_a]:text-text [&_a]:underline [&_a]:underline-offset-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeContentHtml(html) }}
    />
  );
}
