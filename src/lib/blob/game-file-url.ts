// Server-only. Turns games.storage_path (e.g. "some-slug/index.html")
// into the full, publicly playable Vercel Blob URL for an uploaded game
// build. Mirrors resolvePlayUrl in ../games-mapping.ts, which does the
// same thing for page rendering — duplicated rather than imported
// because that module is intentionally environment-agnostic (its base
// URL is passed in as a parameter so it stays usable from the browser
// bundle too), while the two call sites here (link-checking automation
// jobs) are server-only and can just read the env var directly.
//
// See NEXT_PUBLIC_BLOB_BASE_URL in .env.example for what this points at.
export function resolveGameFileUrl(storagePath: string): string {
  const base = process.env.NEXT_PUBLIC_BLOB_BASE_URL;
  if (!base) throw new Error("NEXT_PUBLIC_BLOB_BASE_URL is not set.");
  return `${base.replace(/\/+$/, "")}/game-files/${storagePath}`;
}
