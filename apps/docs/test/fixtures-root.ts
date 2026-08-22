import { fileURLToPath } from "node:url";

/**
 * Deliberately-broken pages the content checks are proved against. They live
 * outside `src/content/docs` because the production run would flag them.
 */
export const FIXTURES_ROOT = fileURLToPath(
  new URL("./fixtures/content", import.meta.url),
);
