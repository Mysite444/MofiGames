"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold, Italic, Underline, Strikethrough, Code, AlignLeft, AlignCenter,
  AlignRight, AlignJustify, List, ListOrdered, Outdent, Indent, Link2,
  Image, Video, Minus, Quote, Table, Undo, Redo, RemoveFormatting,
  ChevronDown, Palette, Highlighter, X, Check, ExternalLink,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DialogState {
  type: "link" | "image" | "video" | "table" | null;
}

interface LinkDialogData {
  url: string;
  text: string;
  newTab: boolean;
  nofollow: boolean;
  sponsored: boolean;
}

interface ImageDialogData {
  url: string;
  alt: string;
  width: string;
  align: "left" | "center" | "right" | "none";
  caption: string;
}

interface VideoDialogData {
  url: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEXT_COLORS = [
  { label: "White", value: "#ffffff" },
  { label: "Light", value: "#d1d5db" },
  { label: "Muted", value: "#9ca3af" },
  { label: "Red", value: "#ef4444" },
  { label: "Orange", value: "#f97316" },
  { label: "Yellow", value: "#eab308" },
  { label: "Green", value: "#22c55e" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Purple", value: "#a855f7" },
  { label: "Pink", value: "#ec4899" },
];

const HIGHLIGHT_COLORS = [
  { label: "Gold", value: "#ffd60a" },
  { label: "Blue", value: "#3da9fc" },
  { label: "Pink", value: "#ff4d5e" },
  { label: "Green", value: "#4ade80" },
  { label: "Purple", value: "#c084fc" },
  { label: "Orange", value: "#fb923c" },
];

const HEADING_OPTIONS = [
  { label: "Paragraph", value: "p", desc: "Normal text" },
  { label: "Heading 1", value: "h1", desc: "Page title" },
  { label: "Heading 2", value: "h2", desc: "Section" },
  { label: "Heading 3", value: "h3", desc: "Subsection" },
  { label: "Heading 4", value: "h4", desc: "" },
  { label: "Heading 5", value: "h5", desc: "" },
  { label: "Heading 6", value: "h6", desc: "" },
];

// ---------------------------------------------------------------------------
// Extract YouTube video ID from various URL formats
// ---------------------------------------------------------------------------
function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main RichTextEditor component
// ---------------------------------------------------------------------------

/** WordPress-style rich text editor built on contentEditable + execCommand.
 * Significantly upgraded from the basic editor — supports headings, alignment,
 * strikethrough, inline code, links (with target/rel), images, YouTube embeds,
 * blockquotes, tables, and more. Works inside admin forms without any
 * external editor library dependency. */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 300,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastValueRef = useRef(value);
  const savedSelectionRef = useRef<Range | null>(null);

  // Dialog state
  const [dialog, setDialog] = useState<DialogState>({ type: null });
  const [linkData, setLinkData] = useState<LinkDialogData>({
    url: "", text: "", newTab: true, nofollow: false, sponsored: false,
  });
  const [imageData, setImageData] = useState<ImageDialogData>({
    url: "", alt: "", width: "", align: "none", caption: "",
  });
  const [videoData, setVideoData] = useState<VideoDialogData>({ url: "" });

  // Dropdown visibility
  const [headingOpen, setHeadingOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [highlightOpen, setHighlightOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);

  // Current heading display
  const [currentHeading, setCurrentHeading] = useState("Paragraph");

  // Only push `value` into the DOM when it changes from *outside* this component.
  useEffect(() => {
    if (editorRef.current && value !== lastValueRef.current) {
      editorRef.current.innerHTML = value;
      lastValueRef.current = value;
    }
  }, [value]);

  // Keyboard shortcuts
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;

      if (e.key === "b") { e.preventDefault(); exec("bold"); }
      else if (e.key === "i") { e.preventDefault(); exec("italic"); }
      else if (e.key === "u") { e.preventDefault(); exec("underline"); }
      else if (e.key === "k") { e.preventDefault(); openLinkDialog(); }
      else if (e.key === "z" && !e.shiftKey) { e.preventDefault(); exec("undo"); }
      else if (e.key === "z" && e.shiftKey) { e.preventDefault(); exec("redo"); }
      else if (e.key === "y") { e.preventDefault(); exec("redo"); }
    }

    el.addEventListener("keydown", handleKeyDown);
    return () => el.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update heading indicator on selection change
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    function updateHeadingIndicator() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const node = sel.anchorNode;
      if (!node) return;
      let el: Element | null = node instanceof Element ? node : node.parentElement;
      while (el && el !== editorRef.current) {
        const tag = el.tagName?.toLowerCase();
        if (tag === "h1") { setCurrentHeading("Heading 1"); return; }
        if (tag === "h2") { setCurrentHeading("Heading 2"); return; }
        if (tag === "h3") { setCurrentHeading("Heading 3"); return; }
        if (tag === "h4") { setCurrentHeading("Heading 4"); return; }
        if (tag === "h5") { setCurrentHeading("Heading 5"); return; }
        if (tag === "h6") { setCurrentHeading("Heading 6"); return; }
        if (tag === "p" || tag === "div") { setCurrentHeading("Paragraph"); return; }
        el = el.parentElement;
      }
      setCurrentHeading("Paragraph");
    }
    document.addEventListener("selectionchange", updateHeadingIndicator);
    return () => document.removeEventListener("selectionchange", updateHeadingIndicator);
  }, []);

  function exec(command: string, arg?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    handleInput();
  }

  function handleInput() {
    if (!editorRef.current) return;
    lastValueRef.current = editorRef.current.innerHTML;
    onChange(editorRef.current.innerHTML);
  }

  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    const range = savedSelectionRef.current;
    if (!range) return;
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function insertHtmlAtCursor(html: string) {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand("insertHTML", false, html);
    handleInput();
  }

  // --- Heading ---
  function applyHeading(tag: string) {
    setHeadingOpen(false);
    editorRef.current?.focus();
    if (tag === "p") {
      document.execCommand("formatBlock", false, "p");
    } else {
      document.execCommand("formatBlock", false, `<${tag}>`);
    }
    handleInput();
  }

  // --- Inline code ---
  function insertInlineCode() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const text = sel.toString();
      insertHtmlAtCursor(`<code class="inline-code">${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code>`);
    } else {
      insertHtmlAtCursor('<code class="inline-code">\u200b</code>');
    }
  }

  // --- Link dialog ---
  function openLinkDialog() {
    saveSelection();
    const sel = window.getSelection();
    const selectedText = sel ? sel.toString() : "";

    // Check if selection is inside a link
    let existingUrl = "";
    if (sel && sel.rangeCount > 0) {
      let node: Element | null = sel.anchorNode instanceof Element
        ? sel.anchorNode
        : sel.anchorNode?.parentElement ?? null;
      while (node && node !== editorRef.current) {
        if (node.tagName === "A") {
          existingUrl = (node as HTMLAnchorElement).href || "";
          break;
        }
        node = node.parentElement;
      }
    }

    setLinkData({
      url: existingUrl,
      text: selectedText,
      newTab: true,
      nofollow: false,
      sponsored: false,
    });
    setDialog({ type: "link" });
  }

  function applyLink() {
    restoreSelection();
    const { url, newTab, nofollow, sponsored } = linkData;
    if (!url.trim()) {
      exec("unlink");
      setDialog({ type: null });
      return;
    }
    const relParts: string[] = [];
    if (nofollow) relParts.push("nofollow");
    if (sponsored) relParts.push("sponsored");
    const rel = relParts.length > 0 ? ` rel="${relParts.join(" ")}"` : "";
    const target = newTab ? ' target="_blank"' : "";

    // Replace selection with linked text (or just create link if text already selected)
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      // Selection exists — wrap it
      exec("createLink", url);
      // Now update the newly created link's attrs
      setTimeout(() => {
        if (!editorRef.current) return;
        const links = editorRef.current.querySelectorAll<HTMLAnchorElement>(`a[href="${url}"]`);
        links.forEach(a => {
          if (newTab) a.setAttribute("target", "_blank");
          else a.removeAttribute("target");
          if (relParts.length > 0) a.setAttribute("rel", relParts.join(" "));
          else a.removeAttribute("rel");
        });
        handleInput();
      }, 0);
    } else {
      // No selection — insert anchor with text
      const displayText = linkData.text || url;
      insertHtmlAtCursor(
        `<a href="${url}"${target}${rel}>${displayText}</a>&nbsp;`
      );
    }
    setDialog({ type: null });
  }

  // --- Image dialog ---
  function openImageDialog() {
    saveSelection();
    setImageData({ url: "", alt: "", width: "", align: "none", caption: "" });
    setDialog({ type: "image" });
  }

  function applyImage() {
    const { url, alt, width, align, caption } = imageData;
    if (!url.trim()) { setDialog({ type: null }); return; }

    const widthAttr = width ? ` width="${width}"` : "";
    const alignStyle =
      align === "left" ? "float:left;margin:0 1rem 0.5rem 0;" :
      align === "right" ? "float:right;margin:0 0 0.5rem 1rem;" :
      align === "center" ? "display:block;margin:0 auto;" : "";

    let html: string;
    if (caption) {
      html = `<figure style="${alignStyle ? `style="${alignStyle}"` : ""}display:table;"><img src="${url}" alt="${alt}"${widthAttr} style="max-width:100%;${alignStyle}border-radius:6px;" /><figcaption style="text-align:center;font-size:0.75em;color:#9ca3af;margin-top:4px;">${caption}</figcaption></figure><p><br></p>`;
    } else {
      html = `<img src="${url}" alt="${alt}"${widthAttr} style="max-width:100%;${alignStyle}border-radius:6px;" /><p><br></p>`;
    }
    insertHtmlAtCursor(html);
    setDialog({ type: null });
  }

  // --- Video / YouTube embed dialog ---
  function openVideoDialog() {
    saveSelection();
    setVideoData({ url: "" });
    setDialog({ type: "video" });
  }

  function applyVideo() {
    const { url } = videoData;
    if (!url.trim()) { setDialog({ type: null }); return; }

    const ytId = extractYouTubeId(url);
    let html: string;
    if (ytId) {
      html = `<div class="video-embed" style="position:relative;padding-bottom:56.25%;height:0;margin:1rem 0;"><iframe src="https://www.youtube-nocookie.com/embed/${ytId}" title="YouTube video" frameborder="0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%;border-radius:8px;"></iframe></div><p><br></p>`;
    } else {
      // Generic video URL
      html = `<video controls style="max-width:100%;border-radius:8px;margin:0.5rem 0;" src="${url}"></video><p><br></p>`;
    }
    insertHtmlAtCursor(html);
    setDialog({ type: null });
  }

  // --- Table ---
  function insertTable(rows: number, cols: number) {
    setTableOpen(false);
    let html = '<table style="border-collapse:collapse;width:100%;margin:0.75rem 0;"><thead><tr>';
    for (let c = 0; c < cols; c++) {
      html += '<th style="border:1px solid rgba(255,255,255,0.15);padding:8px 12px;text-align:left;background:rgba(255,255,255,0.05);">Header</th>';
    }
    html += "</tr></thead><tbody>";
    for (let r = 0; r < rows - 1; r++) {
      html += "<tr>";
      for (let c = 0; c < cols; c++) {
        html += '<td style="border:1px solid rgba(255,255,255,0.12);padding:8px 12px;">Cell</td>';
      }
      html += "</tr>";
    }
    html += "</tbody></table><p><br></p>";
    insertHtmlAtCursor(html);
  }

  // Close all dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Element;
      if (!target.closest("[data-dropdown]")) {
        setHeadingOpen(false);
        setColorOpen(false);
        setHighlightOpen(false);
        setTableOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const closeDialog = useCallback(() => setDialog({ type: null }), []);

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-[var(--color-surface-2)]">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-px border-b border-white/10 bg-black/20 p-1.5">

        {/* Heading dropdown */}
        <div className="relative" data-dropdown>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setHeadingOpen(o => !o); setColorOpen(false); setHighlightOpen(false); setTableOpen(false); }}
            className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold text-white/75 hover:bg-white/10 hover:text-white"
            title="Paragraph / Heading"
          >
            <span className="min-w-[5.5rem] text-left">{currentHeading}</span>
            <ChevronDown size={11} />
          </button>
          {headingOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-lg border border-white/15 bg-[#1a1a1a] shadow-xl">
              {HEADING_OPTIONS.map(h => (
                <button
                  key={h.value}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); applyHeading(h.value); }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10"
                >
                  <span className={h.value === "p" ? "text-sm" : h.value === "h1" ? "text-xl font-bold" : h.value === "h2" ? "text-lg font-bold" : h.value === "h3" ? "text-base font-semibold" : "text-sm font-semibold"}>
                    {h.label}
                  </span>
                  {h.desc && <span className="text-xs text-white/40">{h.desc}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <Divider />

        {/* Text format */}
        <Btn onClick={() => exec("bold")} label="Bold (Ctrl+B)"><Bold size={13} /></Btn>
        <Btn onClick={() => exec("italic")} label="Italic (Ctrl+I)"><Italic size={13} /></Btn>
        <Btn onClick={() => exec("underline")} label="Underline (Ctrl+U)"><Underline size={13} /></Btn>
        <Btn onClick={() => exec("strikeThrough")} label="Strikethrough"><Strikethrough size={13} /></Btn>
        <Btn onClick={insertInlineCode} label="Inline code"><Code size={13} /></Btn>
        <Btn onClick={() => exec("removeFormat")} label="Clear formatting"><RemoveFormatting size={13} /></Btn>

        <Divider />

        {/* Alignment */}
        <Btn onClick={() => exec("justifyLeft")} label="Align left"><AlignLeft size={13} /></Btn>
        <Btn onClick={() => exec("justifyCenter")} label="Center"><AlignCenter size={13} /></Btn>
        <Btn onClick={() => exec("justifyRight")} label="Align right"><AlignRight size={13} /></Btn>
        <Btn onClick={() => exec("justifyFull")} label="Justify"><AlignJustify size={13} /></Btn>

        <Divider />

        {/* Lists */}
        <Btn onClick={() => exec("insertUnorderedList")} label="Bullet list"><List size={13} /></Btn>
        <Btn onClick={() => exec("insertOrderedList")} label="Numbered list"><ListOrdered size={13} /></Btn>
        <Btn onClick={() => exec("outdent")} label="Outdent"><Outdent size={13} /></Btn>
        <Btn onClick={() => exec("indent")} label="Indent"><Indent size={13} /></Btn>

        <Divider />

        {/* Block elements */}
        <Btn onClick={() => exec("formatBlock", "<blockquote>")} label="Blockquote"><Quote size={13} /></Btn>
        <Btn onClick={() => exec("insertHorizontalRule")} label="Horizontal rule"><Minus size={13} /></Btn>

        {/* Table dropdown */}
        <div className="relative" data-dropdown>
          <Btn
            onClick={() => { saveSelection(); setTableOpen(o => !o); setHeadingOpen(false); setColorOpen(false); setHighlightOpen(false); }}
            label="Insert table"
          >
            <Table size={13} />
          </Btn>
          {tableOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-white/15 bg-[#1a1a1a] p-3 shadow-xl">
              <p className="mb-2 text-xs text-white/50">Insert table (rows × cols)</p>
              <TablePicker onInsert={(r, c) => insertTable(r, c)} />
            </div>
          )}
        </div>

        <Divider />

        {/* Media / links */}
        <Btn onClick={openLinkDialog} label="Link (Ctrl+K)"><Link2 size={13} /></Btn>
        <Btn onClick={openImageDialog} label="Insert image"><Image size={13} /></Btn>
        <Btn onClick={openVideoDialog} label="Embed video / YouTube"><Video size={13} /></Btn>

        <Divider />

        {/* Colors */}
        <div className="relative" data-dropdown>
          <Btn
            onClick={() => { saveSelection(); setColorOpen(o => !o); setHeadingOpen(false); setHighlightOpen(false); setTableOpen(false); }}
            label="Text color"
          >
            <Palette size={13} />
          </Btn>
          {colorOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-white/15 bg-[#1a1a1a] p-2 shadow-xl">
              <p className="mb-1.5 text-[10px] text-white/40 px-1">Text color</p>
              <div className="grid grid-cols-5 gap-1">
                {TEXT_COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onMouseDown={(e) => { e.preventDefault(); exec("foreColor", c.value); setColorOpen(false); }}
                    className="h-6 w-6 rounded ring-1 ring-inset ring-white/20 hover:ring-white/60"
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); exec("removeFormat"); setColorOpen(false); }}
                className="mt-1.5 w-full rounded px-2 py-1 text-[10px] text-white/50 hover:bg-white/10"
              >
                Reset
              </button>
            </div>
          )}
        </div>

        <div className="relative" data-dropdown>
          <Btn
            onClick={() => { saveSelection(); setHighlightOpen(o => !o); setHeadingOpen(false); setColorOpen(false); setTableOpen(false); }}
            label="Highlight"
          >
            <Highlighter size={13} />
          </Btn>
          {highlightOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-white/15 bg-[#1a1a1a] p-2 shadow-xl">
              <p className="mb-1.5 text-[10px] text-white/40 px-1">Highlight</p>
              <div className="grid grid-cols-3 gap-1">
                {HIGHLIGHT_COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    onMouseDown={(e) => { e.preventDefault(); exec("hiliteColor", c.value); setHighlightOpen(false); }}
                    className="h-6 w-6 rounded ring-1 ring-inset ring-white/20 hover:ring-white/60"
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); exec("hiliteColor", "transparent"); setHighlightOpen(false); }}
                className="mt-1.5 w-full rounded px-2 py-1 text-[10px] text-white/50 hover:bg-white/10"
              >
                Remove
              </button>
            </div>
          )}
        </div>

        <Divider />

        {/* Undo / Redo */}
        <Btn onClick={() => exec("undo")} label="Undo (Ctrl+Z)"><Undo size={13} /></Btn>
        <Btn onClick={() => exec("redo")} label="Redo (Ctrl+Y)"><Redo size={13} /></Btn>
      </div>

      {/* ── Editor surface ───────────────────────────────────────────────── */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        style={{ minHeight }}
        className={[
          "wp-editor overflow-y-auto px-5 py-4 text-sm leading-relaxed text-white focus:outline-none",
          "[&_h1]:mt-4 [&_h1]:font-display [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-white",
          "[&_h2]:mt-3 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white",
          "[&_h3]:mt-3 [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-white",
          "[&_h4]:mt-2 [&_h4]:font-display [&_h4]:text-base [&_h4]:font-bold [&_h4]:text-white",
          "[&_h5]:mt-2 [&_h5]:font-display [&_h5]:text-sm [&_h5]:font-bold [&_h5]:text-white",
          "[&_h6]:mt-2 [&_h6]:font-display [&_h6]:text-sm [&_h6]:font-semibold [&_h6]:text-white/80",
          "[&_p]:mb-2 [&_p]:leading-relaxed",
          "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
          "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_li]:my-0.5",
          "[&_a]:text-blue-400 [&_a]:underline [&_a]:underline-offset-2",
          "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-white/30 [&_blockquote]:pl-4 [&_blockquote]:text-white/70 [&_blockquote]:italic",
          "[&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_code]:text-white",
          "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-white/5 [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-xs",
          "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm",
          "[&_th]:border [&_th]:border-white/15 [&_th]:bg-white/5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold",
          "[&_td]:border [&_td]:border-white/10 [&_td]:px-3 [&_td]:py-2",
          "[&_hr]:my-4 [&_hr]:border-white/15",
          "[&_strong]:font-bold [&_strong]:text-white",
          "[&_em]:italic",
          "[&_s]:line-through [&_s]:text-white/60",
          "[&_img]:max-w-full [&_img]:rounded-lg",
          "[&_figure]:my-3",
          "[&_figcaption]:mt-1 [&_figcaption]:text-center [&_figcaption]:text-xs [&_figcaption]:text-white/50",
          "[&_.video-embed]:relative [&_.video-embed]:my-4",
          "[&_.inline-code]:rounded [&_.inline-code]:bg-white/10 [&_.inline-code]:px-1.5 [&_.inline-code]:py-0.5 [&_.inline-code]:font-mono [&_.inline-code]:text-xs",
          "empty:before:pointer-events-none empty:before:text-white/25 empty:before:content-[attr(data-placeholder)]",
        ].join(" ")}
      />

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}

      {/* Link dialog */}
      {dialog.type === "link" && (
        <EditorDialog title="Insert / Edit Link" onClose={closeDialog}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-white/60">URL *</span>
            <input
              autoFocus
              type="url"
              placeholder="https://example.com"
              value={linkData.url}
              onChange={e => setLinkData(d => ({ ...d, url: e.target.value }))}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }}
              className="admin-input"
            />
          </label>
          {!linkData.text && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-white/60">Link text (optional — uses selected text)</span>
              <input
                type="text"
                placeholder="Click here"
                value={linkData.text}
                onChange={e => setLinkData(d => ({ ...d, text: e.target.value }))}
                className="admin-input"
              />
            </label>
          )}
          <div className="flex flex-col gap-2">
            <CheckRow
              id="link-newtab"
              checked={linkData.newTab}
              onChange={v => setLinkData(d => ({ ...d, newTab: v }))}
              label="Open in new tab"
              icon={<ExternalLink size={12} />}
            />
            <CheckRow
              id="link-nofollow"
              checked={linkData.nofollow}
              onChange={v => setLinkData(d => ({ ...d, nofollow: v }))}
              label='Add rel="nofollow"'
            />
            <CheckRow
              id="link-sponsored"
              checked={linkData.sponsored}
              onChange={v => setLinkData(d => ({ ...d, sponsored: v }))}
              label='Add rel="sponsored"'
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={applyLink} className="glow-yellow-button flex items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2 text-sm font-semibold text-white">
              <Check size={13} /> Apply
            </button>
            {linkData.url && (
              <button type="button" onClick={() => { restoreSelection(); exec("unlink"); setDialog({ type: null }); }} className="glass rounded-full px-4 py-2 text-sm text-white/70 hover:text-white">
                Remove link
              </button>
            )}
            <button type="button" onClick={closeDialog} className="ml-auto glass rounded-full px-4 py-2 text-sm text-white/70 hover:text-white">
              Cancel
            </button>
          </div>
        </EditorDialog>
      )}

      {/* Image dialog */}
      {dialog.type === "image" && (
        <EditorDialog title="Insert Image" onClose={closeDialog}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-white/60">Image URL *</span>
            <input autoFocus type="url" placeholder="https://…/image.jpg" value={imageData.url}
              onChange={e => setImageData(d => ({ ...d, url: e.target.value }))}
              className="admin-input"
            />
          </label>
          {imageData.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageData.url} alt="" className="h-24 w-auto max-w-full rounded-lg object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-white/60">Alt text (accessibility)</span>
            <input type="text" placeholder="Describe the image…" value={imageData.alt}
              onChange={e => setImageData(d => ({ ...d, alt: e.target.value }))}
              className="admin-input"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-white/60">Caption (optional)</span>
            <input type="text" placeholder="Image caption…" value={imageData.caption}
              onChange={e => setImageData(d => ({ ...d, caption: e.target.value }))}
              className="admin-input"
            />
          </label>
          <div className="flex gap-3 text-sm">
            <span className="text-xs text-white/60 self-center">Width:</span>
            <input type="text" placeholder="e.g. 600" value={imageData.width}
              onChange={e => setImageData(d => ({ ...d, width: e.target.value }))}
              className="admin-input w-24"
            />
            <span className="text-xs text-white/60 self-center">Align:</span>
            <select value={imageData.align}
              onChange={e => setImageData(d => ({ ...d, align: e.target.value as ImageDialogData["align"] }))}
              className="admin-input w-28"
            >
              <option value="none">None</option>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={applyImage} className="glow-yellow-button flex items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2 text-sm font-semibold text-white">
              <Check size={13} /> Insert
            </button>
            <button type="button" onClick={closeDialog} className="ml-auto glass rounded-full px-4 py-2 text-sm text-white/70 hover:text-white">
              Cancel
            </button>
          </div>
        </EditorDialog>
      )}

      {/* Video dialog */}
      {dialog.type === "video" && (
        <EditorDialog title="Embed Video / YouTube" onClose={closeDialog}>
          <p className="text-xs text-white/50">Paste a YouTube URL or direct video link.</p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs text-white/60">URL *</span>
            <input autoFocus type="url" placeholder="https://youtube.com/watch?v=…" value={videoData.url}
              onChange={e => setVideoData({ url: e.target.value })}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); applyVideo(); } }}
              className="admin-input"
            />
          </label>
          {extractYouTubeId(videoData.url) && (
            <div className="relative w-full rounded-lg overflow-hidden bg-black/30" style={{ paddingBottom: "56.25%" }}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${extractYouTubeId(videoData.url)}`}
                title="Preview"
                frameBorder="0"
                className="absolute inset-0 h-full w-full rounded-lg"
              />
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={applyVideo} className="glow-yellow-button flex items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2 text-sm font-semibold text-white">
              <Check size={13} /> Embed
            </button>
            <button type="button" onClick={closeDialog} className="ml-auto glass rounded-full px-4 py-2 text-sm text-white/70 hover:text-white">
              Cancel
            </button>
          </div>
        </EditorDialog>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-white/10" />;
}

function Btn({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}

function EditorDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-40 flex flex-col gap-3 border-t border-white/15 bg-[#111] p-4 shadow-2xl">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">{title}</h4>
        <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 hover:bg-white/10 hover:text-white">
          <X size={14} />
        </button>
      </div>
      {children}
    </div>
  );
}

function CheckRow({ id, checked, onChange, label, icon }: {
  id: string; checked: boolean; onChange: (v: boolean) => void; label: string; icon?: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm text-white/70 hover:text-white">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded accent-white"
      />
      {icon}
      <span>{label}</span>
    </label>
  );
}

function TablePicker({ onInsert }: { onInsert: (rows: number, cols: number) => void }) {
  const [hovered, setHovered] = useState<[number, number]>([0, 0]);
  const MAX = 6;
  return (
    <div>
      <div className="flex flex-col gap-0.5">
        {Array.from({ length: MAX }).map((_, r) => (
          <div key={r} className="flex gap-0.5">
            {Array.from({ length: MAX }).map((_, c) => (
              <button
                key={c}
                type="button"
                onMouseEnter={() => setHovered([r + 1, c + 1])}
                onMouseLeave={() => setHovered([0, 0])}
                onClick={() => onInsert(r + 1, c + 1)}
                className={`h-6 w-6 rounded border ${r < hovered[0] && c < hovered[1] ? "border-white/40 bg-white/20" : "border-white/10 bg-white/5"}`}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-center text-xs text-white/40">
        {hovered[0] > 0 ? `${hovered[0]} × ${hovered[1]}` : "Hover to select"}
      </p>
    </div>
  );
}
