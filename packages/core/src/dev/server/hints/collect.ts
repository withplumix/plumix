import type { AppContext } from "../../../context/app-context.js";
import type { HookExecutor } from "../../../hooks/registry.js";
import type { DevErrorHint } from "../../ui/index.js";

import "./types.js";

/**
 * Isolates each `error_page:hints` handler so a throwing subscriber can't sink
 * the rest or take down the dev error page.
 */
export function collectDevErrorHints(
  hooks: HookExecutor,
  error: unknown,
  ctx: AppContext,
): readonly DevErrorHint[] {
  return hooks.applyFilterIsolated("error_page:hints", [], error, ctx);
}
