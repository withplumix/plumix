import type { AppContext } from "../../../context/app-context.js";
import type { DevErrorHint } from "../../ui/index.js";

declare module "../../../hooks/types.js" {
  interface FilterRegistry {
    "error_page:hints": (
      hints: readonly DevErrorHint[],
      error: unknown,
      ctx: AppContext,
    ) => readonly DevErrorHint[];
  }
}
