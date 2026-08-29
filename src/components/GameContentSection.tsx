import { sanitizeContentHtml } from "@/lib/sanitize-html";

/**
 * Renders a game's long-form "arranged content" — the How to Play / Tips /
 * Features / FAQ style article body authored in the admin panel's
 * RichTextEditor (see GamesAdminClient's "Content" field) — with real
 * heading, paragraph, and list structure, instead of the flat, unbroken
 * paragraph the page used to render `game.description` as.
 *
 * Same typography treatment as RichContent (used for CMS Pages/Blog) so
 * this matches the rest of the site rather than inventing a second style.
 * Shared between GameDetailsSection (desktop) and MobileGamePage (mobile)
 * so both surfaces render identically arranged content — see the reference
 * CrazyGames-style layout (intro paragraph → "How to Play" → "Tips" bullet
 * list → "Features" bullet list → "FAQ") this was built to match.
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
