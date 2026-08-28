import { mulberry32, hashSeed } from "./prng";
import type { Game } from "./types";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Anchored rather than `new Date()` so these placeholder dates stay stable
// (and never drift into the future) regardless of when the site is viewed.
const TODAY = new Date(2026, 5, 28); // June 28, 2026

export interface GameMeta {
  ratingOutOf10: number;
  votes: number;
  releasedLabel: string; // e.g. "June 2026"
  lastUpdatedLabel: string; // e.g. "June 2026"
  lastUpdatedFullDate: string; // e.g. "Jun 17, 2026"
  gameEngine: string;
  platform: string;
  orientation: string;
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

/**
 * Generates the "Rating / Released / Last Updated / Engine / Platform /
 * Orientation" facts shown in the new details block. Seeded per game slug,
 * so the same game always shows the same numbers — these are front-end
 * placeholders (same stage as the player itself) rather than real
 * analytics, since there's no backend tracking any of this yet.
 */
export function getGameMeta(game: Game): GameMeta {
  const rng = mulberry32(hashSeed(`${game.slug}-meta`));

  const ratingOutOf10 = Math.round(game.rating * 2 * 10) / 10;
  const votes = Math.round(game.plays / (550 + rng() * 250));

  const releasedMonthsAgo = Math.floor(rng() * 18); // up to 17 months back
  const released = addMonths(TODAY, -releasedMonthsAgo);

  const updatedMonthsAgo = Math.floor(rng() * releasedMonthsAgo); // always <= released
  const updated = addMonths(TODAY, -updatedMonthsAgo);
  const updatedDay = 1 + Math.floor(rng() * 28);

  return {
    ratingOutOf10,
    votes,
    releasedLabel: `${MONTHS[released.getMonth()]} ${released.getFullYear()}`,
    lastUpdatedLabel: `${MONTHS[updated.getMonth()]} ${updated.getFullYear()}`,
    lastUpdatedFullDate: `${MONTHS[updated.getMonth()]} ${updatedDay}, ${updated.getFullYear()}`,
    gameEngine: "Externally hosted (iframe)",
    platform: "Browser (all devices)",
    orientation: "Landscape",
  };
}
