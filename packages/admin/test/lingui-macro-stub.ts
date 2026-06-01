/**
 * Test-mode stub for `@lingui/core/macro`.
 *
 * Production builds transform `defineMessage({ id, message })` calls
 * via `@lingui/vite-plugin` + `@rolldown/plugin-babel` (configured in
 * `vite.config.ts`). Vitest runs through vite-node's transform path
 * which doesn't reliably invoke the Babel preset on plain `.ts`
 * imports — the real macro entrypoint then throws at module load
 * trying to use `babel-plugin-macros` as a runtime fallback.
 *
 * Aliasing the macro to this passthrough mirrors what the Babel
 * transform would have produced (the descriptor object literal). See
 * `vitest.config.ts` for the alias wiring.
 */
import type { MessageDescriptor } from "@lingui/core";

export function defineMessage(
  descriptor: MessageDescriptor,
): MessageDescriptor {
  return descriptor;
}

export const msg = defineMessage;
