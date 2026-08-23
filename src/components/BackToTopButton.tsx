import { ArrowUp } from "lucide-react";

// Deliberately zero JavaScript: a plain anchor to the #top landmark in
// AppShell. Native browser behavior, animated by the global
// `html { scroll-behavior: smooth }` rule — nothing to hydrate, nothing
// that can fail to bind.
export function BackToTopButton() {
  return (
    <div className="px-4">
      <a
        href="#top"
        className="btn-cta flex w-full items-center justify-center gap-2 py-3 text-sm"
      >
        <ArrowUp size={18} strokeWidth={2.5} />
        Back to Top
      </a>
    </div>
  );
}
