import { sanitizeContentHtml } from "@/lib/sanitize-html";

/** Renders HTML from the admin panel's RichTextEditor (Pages, Blog/News)
 * with the same typography treatment StaticPage uses, plus list and mark
 * (highlight) styling the editor's toolbar can produce. */
export function RichContent({ html, className = "" }: { html: string; className?: string }) {
  return (
    <div
      className={`flex flex-col gap-3 text-sm leading-relaxed text-text-muted [&_h2]:mt-2 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-white [&_h3]:mt-1 [&_h3]:font-display [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-white [&_strong]:text-white [&_a]:text-white [&_a]:underline [&_a]:underline-offset-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeContentHtml(html) }}
    />
  );
}
