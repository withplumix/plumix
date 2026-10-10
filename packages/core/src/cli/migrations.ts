import { fileURLToPath } from "node:url";

/**
 * Core's shipped history, at the package root: `../../migrations` from both
 * `src/cli/` and `dist/cli/`.
 */
export const CORE_MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../migrations", import.meta.url),
);
