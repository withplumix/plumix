import type { AppContext } from "../../../context/app.js";
import type { DevErrorHint } from "../../ui/index.js";

/**
 * The dev-only hint filter (#1597, decision #1575). Runs on every 5xx the dev
 * error page renders: each handler receives the hints matched so far, the raw
 * thrown value, and the request context, and returns the next hint list. Core
 * registers a low-priority subscriber matching its typed errors and a curated
 * set of untyped pitfalls; plugins subscribe to add or override hints. This
 * filter IS the plugin-facing hint API — it mirrors `debug_bar:panels`.
 */
declare module "../../../hooks/types.js" {
  interface FilterRegistry {
    "error_page:hints": (
      hints: readonly DevErrorHint[],
      error: unknown,
      ctx: AppContext,
    ) => readonly DevErrorHint[];
  }
}
