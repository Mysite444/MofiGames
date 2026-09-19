import {
  Swords, Compass, Car, Truck, Bike, Trophy, CircleDot, Puzzle, LayoutGrid,
  Spade, Dices, Crosshair, Target, Skull, Ghost, Users, Gamepad2, Globe,
  MousePointerClick, Hourglass, Settings2, Blocks, Sprout, Shirt, ChefHat,
  SpellCheck2, CircleHelp, ParkingCircle, DoorOpen, PersonStanding, Castle,
  Music2, Flame, Sparkles, Home, Joystick, Brain, RefreshCw, Zap, type LucideIcon,
} from "lucide-react";
import type { IconName } from "./types";

export const iconMap: Record<IconName, LucideIcon> = {
  Swords, Compass, Car, Truck, Bike, Trophy, CircleDot, Puzzle, LayoutGrid,
  Spade, Dices, Crosshair, Target, Skull, Ghost, Users, Gamepad2, Globe,
  MousePointerClick, Hourglass, Settings2, Blocks, Sprout, Shirt, ChefHat,
  SpellCheck2, CircleHelp, ParkingCircle, DoorOpen, PersonStanding, Castle,
  Music2, Flame, Flame2: Flame, Sparkles, Home, Joystick, Brain, RefreshCw, Zap,
};

// Single source of truth for "what counts as a valid icon name" — derived
// from iconMap itself so it can never drift out of sync with it. Used by:
// - the categories API route (rejects an invalid icon at creation time)
// - the admin category form (a <select> of exactly these, not free text)
// - mapDbCategoryRow (sanitizes any real category's icon field, in case a
//   bad value ever made it into the database some other way — e.g. a
//   direct SQL edit, or data saved before this validation existed)
export const ICON_NAMES = Object.keys(iconMap) as IconName[];

export function isIconName(value: string): value is IconName {
  return Object.prototype.hasOwnProperty.call(iconMap, value);
}
