import { createContext, useContext } from "react";

import type { HtmlAllowlist } from "./sanitize.js";
import { BASELINE_HTML_ALLOWLIST } from "./sanitize.js";

/**
 * React context carrying the active `HtmlAllowlist` to `core/html`'s
 * renderer. Defaults to the baseline so consumers that haven't wired
 * `buildApp`-produced allowlist still get a safe-by-default render.
 *
 * SSR shells / admin canvases populate the provider with the
 * registry-derived allowlist; the html block reads via the hook.
 */
const HtmlAllowlistContext = createContext<HtmlAllowlist>(
  BASELINE_HTML_ALLOWLIST,
);

export const HtmlAllowlistProvider = HtmlAllowlistContext.Provider;

export function useHtmlAllowlist(): HtmlAllowlist {
  return useContext(HtmlAllowlistContext);
}
