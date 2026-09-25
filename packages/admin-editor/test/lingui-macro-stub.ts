// Test-mode passthrough for `@lingui/core/macro`. See `vitest.config.ts`
// for the alias wiring and rationale.
import type { MessageDescriptor } from "@lingui/core";

export function defineMessage(
  descriptor: MessageDescriptor,
): MessageDescriptor {
  return descriptor;
}
