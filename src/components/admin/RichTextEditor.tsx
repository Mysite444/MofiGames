"use client";

import { useEffect, useRef } from "react";
import {
  Bold,
  Italic,
  Underline,
  Highlighter,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link2,
  RemoveFormatting,
} from "lucide-react";

const HIGHLIGHT_SWATCHES = [
  { label: "Gold", value: "#ffd60a" },
  { label: "Blue", value: "#3da9fc" },
  { label: "Pink", value: "#ff4d5e" },
  { label: "Green", value: "#4ade80" },
];

/** A minimal rich text editor for Pages and Blog/News content. Built on
 * contentEditable + document.execCommand rather than a library, since the
 * project intentionally keeps its dependency list small. execCommand is
 * deprecated but every evergreen browser still supports the handful of
 * commands used here (bold/italic/underline/hiliteColor/formatBlock/lists/
 * createLink/removeFormat), so it's a reasonable trade for a single-admin
 * content editor. */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastValue = useRef(value);

  // Only push `value` into the DOM when it changes from *outside* this
  // component (e.g. switching which post is being edited) — otherwise
  // every keystroke would reset the cursor to the start.
  useEffect(() => {
    if (ref.current && value !== lastValue.current) {
      ref.current.innerHTML = value;
      lastValue.current = value;
    }
  }, [value]);

  function exec(command: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    handleInput();
  }

  function handleInput() {
    if (!ref.current) return;
    lastValue.current = ref.current.innerHTML;
    onChange(ref.current.innerHTML);
  }

  function handleLink() {
    const url = window.prompt("Link URL (https://…)");
    if (url) exec("createLink", url);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-white/10 p-1.5">
        <ToolbarButton onClick={() => exec("bold")} label="Bold">
          <Bold size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("italic")} label="Italic">
          <Italic size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("underline")} label="Underline">
          <Underline size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("formatBlock", "<h2>")} label="Heading">
          <Heading2 size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("formatBlock", "<h3>")} label="Subheading">
          <Heading3 size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("insertUnorderedList")} label="Bullet list">
          <List size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("insertOrderedList")} label="Numbered list">
          <ListOrdered size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={handleLink} label="Link">
          <Link2 size={15} />
        </ToolbarButton>
        <ToolbarButton onClick={() => exec("removeFormat")} label="Clear formatting">
          <RemoveFormatting size={15} />
        </ToolbarButton>

        <div className="mx-1 h-5 w-px bg-white/10" />

        <Highlighter size={14} className="mr-0.5 text-text-faint" />
        {HIGHLIGHT_SWATCHES.map((s) => (
          <button
            key={s.value}
            type="button"
            title={`Highlight: ${s.label}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec("hiliteColor", s.value)}
            className="h-5 w-5 shrink-0 rounded-full ring-1 ring-inset ring-white/20"
            style={{ backgroundColor: s.value }}
          />
        ))}
        <ToolbarButton onClick={() => exec("hiliteColor", "transparent")} label="Remove highlight">
          <span className="text-[10px] font-semibold">✕</span>
        </ToolbarButton>
      </div>

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        className="prose-editor min-h-[220px] max-h-[520px] overflow-y-auto px-4 py-3 text-sm leading-relaxed text-white focus:outline-none [&_a]:text-white [&_a]:underline [&_h2]:mt-3 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-white [&_h3]:mt-2 [&_h3]:font-display [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-white [&_li]:ml-4 [&_ol]:list-decimal [&_p]:mb-2 [&_ul]:list-disc"
      />
    </div>
  );
}

function ToolbarButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/75 hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}
