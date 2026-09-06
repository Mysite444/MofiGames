/**
 * Temporary player feature flags.
 *
 * SOUND_BUTTON_ENABLED — controls the Mute/Unmute button on BOTH the
 * desktop player (PlayerActionBar) and the mobile fullscreen overlay
 * (MobileLandscapePlayer). Set to `false` on [date] because the button's
 * effect is inherently best-effort for third-party embed-URL games: a
 * cross-origin iframe has no DOM API a host page can use to force it
 * silent, so the button only works when a given embedded game happens to
 * implement our postMessage mute convention (see lib/use-embed-mute.ts).
 * Games that don't implement it never respond, which read as "the mute
 * button doesn't work."
 *
 * Hidden rather than removed — the underlying mute state and postMessage
 * broadcast (lib/use-embed-mute.ts, and the mobile player's own copy of the
 * same contract) are left fully intact in both players. To bring the
 * button back, flip this to `true`; no other code changes are needed.
 *
 * Longer-term options if/when this comes back:
 *  - Ship our own SDK script that self-hosted uploaded builds include, so
 *    same-origin/own-hosted games can be muted with certainty.
 *  - Add a second listener for a specific network's documented protocol
 *    (e.g. GameDistribution's SDK) for games sourced from that network.
 */
export const SOUND_BUTTON_ENABLED = false;
