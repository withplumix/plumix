import { createContext, useContext } from "react";

import type { HtmlAllowlist } from "./sanitize.js";
import { BASELINE_HTML_ALLOWLIST } from "./sanitize.js";

// Defaults to the baseline so a consumer without a provider still renders
// safely.
const HtmlAllowlistContext = createContext<HtmlAllowlist>(
  BASELINE_HTML_ALLOWLIST,
);

export const HtmlAllowlistProvider = HtmlAllowlistContext.Provider;

export function useHtmlAllowlist(): HtmlAllowlist {
  return useContext(HtmlAllowlistContext);
}
