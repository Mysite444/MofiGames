import { sanitizeContentHtml } from "@/lib/sanitize-html";

/**
 * Renders HTML from the admin panel's RichTextEditor (Pages, Blog/News,
 * and other CMS content) with full rich text styling — headings, paragraphs,
 * lists, blockquotes, tables, code, images, and YouTube embeds.
 *
 * Mirrors the styles in GameContentSection for a consistent reading
 * experience across all content types.
 */
export function RichContent({ html, className = "" }: { html: string; className?: string }) {
  return (
    <div
      className={[
        "rich-content flex flex-col gap-0 text-sm leading-relaxed text-text-muted",
        // Headings
        "[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:font-display [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-white",
        "[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white",
        "[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-white",
        "[&_h4]:mt-2 [&_h4]:mb-1 [&_h4]:font-display [&_h4]:text-base [&_h4]:font-semibold [&_h4]:text-white",
        "[&_h5]:mt-2 [&_h5]:mb-1 [&_h5]:text-sm [&_h5]:font-semibold [&_h5]:text-white",
        "[&_h6]:mt-2 [&_h6]:mb-1 [&_h6]:text-sm [&_h6]:font-semibold [&_h6]:text-white/80",
        // Paragraphs
        "[&_p]:mb-2 [&_p]:leading-relaxed",
        // Inline
        "[&_strong]:font-bold [&_strong]:text-white",
        "[&_em]:italic",
        "[&_s]:line-through [&_s]:opacity-70",
        "[&_del]:line-through [&_del]:opacity-70",
        "[&_u]:underline",
        "[&_sup]:text-xs [&_sup]:align-super",
        "[&_sub]:text-xs [&_sub]:align-sub",
        // Code
        "[&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-white",
        "[&_.inline-code]:rounded [&_.inline-code]:bg-white/10 [&_.inline-code]:px-1.5 [&_.inline-code]:py-0.5 [&_.inline-code]:font-mono [&_.inline-code]:text-xs",
        "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-white/5 [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-xs [&_pre]:leading-normal",
        // Links
        "[&_a]:text-white [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:opacity-70",
        // Lists
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:my-0.5",
        "[&_li_ul]:mt-1 [&_li_ol]:mt-1",
        // Blockquote
        "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-white/30 [&_blockquote]:pl-4 [&_blockquote]:text-white/70 [&_blockquote]:italic",
        // HR
        "[&_hr]:my-5 [&_hr]:border-white/10",
        // Images
        "[&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-xl",
        "[&_figure]:my-3",
        "[&_figcaption]:mt-1 [&_figcaption]:text-center [&_figcaption]:text-xs [&_figcaption]:text-white/50",
        // Tables
        "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
        "[&_th]:border [&_th]:border-white/10 [&_th]:bg-white/5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-white",
        "[&_td]:border [&_td]:border-white/8 [&_td]:px-3 [&_td]:py-2",
        "[&_caption]:mb-1 [&_caption]:text-center [&_caption]:text-xs [&_caption]:text-white/50",
        // Video embeds
        "[&_.video-embed]:relative [&_.video-embed]:my-4 [&_.video-embed]:overflow-hidden [&_.video-embed]:rounded-xl",
        "[&_iframe]:w-full [&_iframe]:rounded-xl",
        "[&_video]:my-2 [&_video]:max-w-full [&_video]:rounded-xl",
        // Marks / highlights
        "[&_mark]:rounded [&_mark]:px-1 [&_mark]:text-black",
        className,
      ].join(" ")}
      dangerouslySetInnerHTML={{ __html: sanitizeContentHtml(html) }}
    />
  );
}
