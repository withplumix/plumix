import type { DebugHistoryEntry } from "../request-history/store.js";
import { DEBUG_REQUESTS_PATH } from "../request-history/path.js";

/** The in-flight request the inline bar is rendering — not yet in history. */
export interface CurrentRequest {
  readonly id: string;
  readonly method: string;
  readonly path: string;
}

/**
 * `status === null` is the sole marker of the in-flight request: its
 * response hasn't finished when the inline bar renders.
 */
export interface SwitcherEntry {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly status: number | null;
  readonly durationMs: number | null;
}

/**
 * `history` must already be newest-first. The current request is deduped out
 * in case the store already holds it.
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

/**
 * Fail-soft: a non-OK response or a thrown fetch leaves the current panels,
 * and the host page the bar is injected into, untouched.
 */
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
