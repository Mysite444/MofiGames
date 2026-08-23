import type { Game } from "@/lib/types";

// Generic placeholder control scheme — used only as a fallback for
// placeholder/demo games (or a real game an admin hasn't filled Controls
// in for yet). Real games show their own admin-entered `controls` field
// (Admin → Games → edit a game → Controls, one control per line).
export const FALLBACK_CONTROLS = [
  "WASD or Arrow Keys = move",
  "Mouse = aim / interact",
  "Left Click = select / shoot",
  "Space = jump / action",
  "P or Esc = pause menu",
];

/** Splits a game's `controls` field into display lines, falling back to
 * FALLBACK_CONTROLS when it's empty/unset. Shared by the game-details
 * "Controls" section and the play-screen "Game controls" popover so both
 * surfaces always show the exact same list. */
export function getControlsList(game: Pick<Game, "controls">): string[] {
  return game.controls?.trim()
    ? game.controls.split("\n").map((line) => line.trim()).filter(Boolean)
    : FALLBACK_CONTROLS;
}
