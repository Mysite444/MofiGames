"use client";

/**
 * Triggers a browser file download without relying on `window.open`.
 *
 * `window.open(url, "_blank")` called after an `await` (e.g. once an
 * export/fetch request resolves) is no longer considered directly
 * triggered by the user's click in many browsers — Safari enforces this
 * strictly, and Chrome/Firefox popup blockers can do the same under
 * load — so the call can silently do nothing with no visible error.
 *
 * Clicking a temporary <a download> element instead is not subject to
 * popup blocking (it's a navigation/download, not a new window), and
 * lets us suggest a filename. Combined with the server sending the
 * signed URL with a `download` option (Content-Disposition: attachment),
 * this reliably produces a real "Save As" instead of the browser just
 * displaying the file's raw contents in a tab.
 */
export function triggerBrowserDownload(url: string, filename?: string) {
  const link = document.createElement("a");
  link.href = url;
  if (filename) link.download = filename;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
