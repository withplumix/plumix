import type { DebugHistoryEntry } from "./history.js";
import { DEBUG_REQUESTS_PATH } from "./requests-path.js";

/** The in-flight request the inline bar is rendering — not yet in history. */
export interface CurrentRequest {
  readonly id: string;
  readonly method: string;
  readonly path: string;
}

/**
 * One option in the bar's request switcher. `status`/`durationMs` are `null`
 * for the current request — its response hasn't finished when the inline bar
 * renders — and carry the captured outcome for a past request. `status === null`
 * is thus the sole marker of the in-flight request (it's pre-selected via the
 * <select>'s `defaultValue`, not a flag here).
 */
export interface SwitcherEntry {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly status: number | null;
  readonly durationMs: number | null;
}

/**
 * The newest-first switcher list: the current (in-flight) request first, then
 * captured history. `history` is already newest-first (the store's `get()`);
 * the current request is deduped out of it so it never appears twice — it isn't
 * captured until request-end, but a race (or a store that already holds it)
 * shouldn't double it.
 */
export function buildSwitcherEntries(
  current: CurrentRequest,
  history: readonly DebugHistoryEntry[],
): readonly SwitcherEntry[] {
  const past = history
    .filter((e) => e.id !== current.id)
    .map((e): SwitcherEntry => ({
      id: e.id,
      method: e.snapshot.context.method,
      path: e.snapshot.context.path,
      status: e.status,
      durationMs: e.durationMs,
    }));
  return [{ ...current, status: null, durationMs: null }, ...past];
}

/**
 * A compact option label — `POST /x · 500 · 9ms` — or `GET /now · current` for
 * the in-flight request whose status/duration aren't known yet.
 */
export function switcherOptionLabel(entry: SwitcherEntry): string {
  const head = `${entry.method} ${entry.path}`;
  if (entry.status === null) return `${head} · current`;
  return `${head} · ${entry.status} · ${entry.durationMs}ms`;
}

// The switcher's only client-side concession, kept minimal (listen → fetch →
// swap) and dev-only: it lives inside the debug-bar module, which is tree-shaken
// from production, so no script reaches a prod page. It reads the endpoint off
// the wrapper's data attribute (base-path aware, resolved at render), fetches
// the selected request's pre-rendered `?format=html` panels, and swaps them in.
// Fail-soft is the invariant: a non-OK response or a thrown fetch leaves the
// current panels — and the host page the bar is injected into — untouched.
export const DEBUG_SWITCHER_SCRIPT = `
(function () {
  var root = document.querySelector("[data-plumix-debug-switch]");
  if (!root) return;
  var select = root.querySelector("select");
  var panels = root.querySelector("[data-plumix-debug-panels]");
  var endpoint = root.getAttribute("data-plumix-debug-endpoint");
  if (!select || !panels || !endpoint) return;
  select.addEventListener("change", function () {
    var url = endpoint + "/" + encodeURIComponent(select.value) + "?format=html";
    fetch(url, { headers: { accept: "text/html" } })
      .then(function (res) { return res.ok ? res.text() : null; })
      .then(function (html) { if (html !== null) panels.innerHTML = html; })
      .catch(function () {});
  });
})();
`.trim();

/** Base of the switcher's fetch endpoint, base-path aware. */
export function switcherEndpoint(basePath: string): string {
  return `${basePath}${DEBUG_REQUESTS_PATH}`;
}
