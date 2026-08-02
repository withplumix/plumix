import type { AppContext } from "../../../context/app.js";
import type { HookExecutor } from "../../../hooks/registry.js";
import type { DevErrorHint } from "../../ui/index.js";

import "./types.js";

/**
 * Gathers the "how to fix" hints for a caught error: runs the
 * `error_page:hints` filter chain — isolating each handler so a throwing or
 * non-array-returning subscriber can't sink the rest or take down the dev error
 * page — and returns the matched hints in filter order (typed core hints first,
 * then untyped, then plugin contributions, unless a plugin reorders them). An
 * empty result means nothing recognized the error, and the page renders no hint
 * card.
 */
export function collectDevErrorHints(
  hooks: HookExecutor,
  error: unknown,
  ctx: AppContext,
): readonly DevErrorHint[] {
  return hooks.applyFilterIsolated("error_page:hints", [], error, ctx);
}
