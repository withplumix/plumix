import type { MessageDescriptor } from "@lingui/core";

/**
 * Translator-facing only, like WP's `_x()`: runtime resolution still keys on
 * `id`.
 */
export function withContext<T extends MessageDescriptor>(
  descriptor: T,
  context: string,
): T & { readonly context: string } {
  return { ...descriptor, context };
}
