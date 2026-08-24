// Thin client-side wrapper around POST/GET /api/games/:slug/rate. Kept
// separate from game-activity.ts (which talks to Supabase directly) since
// rating writes go through the route handler — the average/count are
// maintained by a database trigger, so the route (not the client) needs
// to be the one calling it, same reasoning as the play-count route.

export async function submitGameRating(
  slug: string,
  rating: number
): Promise<{ rating: number; ratingCount: number }> {
  const response = await fetch(`/api/games/${encodeURIComponent(slug)}/rate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating }),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error ?? "Failed to save rating.");
  }
  return { rating: json.rating, ratingCount: json.ratingCount };
}

export async function fetchMyGameRating(slug: string): Promise<number | null> {
  try {
    const response = await fetch(`/api/games/${encodeURIComponent(slug)}/rate`);
    if (!response.ok) return null;
    const json = await response.json();
    return json?.myRating ?? null;
  } catch {
    return null;
  }
}
