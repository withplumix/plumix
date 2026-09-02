import type { DevErrorHint } from "plumix";

/**
 * The slice of `PlumixApp["hooks"]` this module depends on — narrow enough
 * that a test can supply a plain fake instead of a real `HookRegistry`.
 */
export interface ErrorHintHooks {
  addFilter(
    name: "error_page:hints",
    fn: (
      hints: readonly DevErrorHint[],
      error: unknown,
    ) => readonly DevErrorHint[],
    options: { readonly plugin?: string | null; readonly priority?: number },
  ): void;
}

/**
 * Registers the Cloudflare-specific dev error hint through core's
 * `error_page:hints` filter. Kept out of core so a non-Cloudflare deploy
 * never sees `wrangler.jsonc` in an error page (#2166) — the wiring mirrors
 * `registerCoreErrorHints`, just from this runtime package instead.
 */
export function registerCloudflareErrorHints(hooks: ErrorHintHooks): void {
  hooks.addFilter(
    "error_page:hints",
    (hints, error) => {
      const hint = matchBindingHint(error);
      return hint ? [...hints, hint] : hints;
    },
    { plugin: "@plumix/runtime-cloudflare", priority: 10 },
  );
}

// A binding referenced in code isn't declared for the worker.
function matchBindingHint(error: unknown): DevErrorHint | null {
  if (
    error instanceof Error &&
    /missing (?:required )?binding|no binding named/i.test(error.message)
  ) {
    return {
      title: "Declare the binding",
      body:
        "Your code used a binding that isn't declared. Add it to `wrangler.jsonc` " +
        "(the `d1_databases`, `kv_namespaces`, `r2_buckets`, … block that fits), " +
        "then restart the dev server.",
    };
  }
  return null;
}
