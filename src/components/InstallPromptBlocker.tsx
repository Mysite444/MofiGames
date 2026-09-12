"use client";

import { useEffect } from "react";

/**
 * Suppresses the browser's automatic "Install app" / "Add to Home Screen"
 * prompt (Android Chrome's mini-infobar or full install banner).
 *
 * This site is a game-embedding website, not a maintained app — there's no
 * real installed-app experience behind the install prompt, so accepting it
 * just reopened the same site in a bare standalone window with none of the
 * behavior a visitor would expect from "installing an app" (reported as
 * "the installed app is empty").
 *
 * `manifest.ts`'s `display: "browser"` already stops Chrome from
 * considering this site installable in the first place, which is the real
 * fix and should mean this event never even fires. This listener is a
 * second, defensive layer: browsers (or future admin-uploaded manifest
 * data) can still dispatch `beforeinstallprompt` in edge cases, and
 * calling `preventDefault()` on it — without ever calling the event's own
 * `.prompt()` — stops the banner from being shown, full stop.
 *
 * Deliberately does NOT stash the event for a later custom "Install" CTA
 * (the usual reason to intercept this event) — there's nothing to install
 * behind it, so nothing here should ever trigger it.
 */
export function InstallPromptBlocker() {
  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  return null;
}
