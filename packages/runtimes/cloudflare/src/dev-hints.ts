import type { DevErrorHintRegistration } from "plumix";

/**
 * A binding referenced in code isn't declared for the worker. Kept out of core
 * so a non-Cloudflare deploy never sees `wrangler.jsonc` in an error page.
 */
export const bindingErrorHint: DevErrorHintRegistration = {
  id: "cloudflare-binding",
  matches: (error) =>
    error instanceof Error &&
    /missing (?:required )?binding|no binding named/i.test(error.message),
  title: "Declare the binding",
  body:
    "Your code used a binding that isn't declared. Add it to `wrangler.jsonc` " +
    "(the `d1_databases`, `kv_namespaces`, `r2_buckets`, … block that fits), " +
    "then restart the dev server.",
};
