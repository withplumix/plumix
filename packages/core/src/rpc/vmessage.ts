import type { MessageDescriptor } from "@lingui/core";

/**
 * Lazy descriptor-to-string resolver for valibot validator messages.
 * Admin's `bootI18n` registers a Lingui-backed resolver via
 * `setI18nResolver`; server-side bundles never register, so the
 * returned thunk falls back to `descriptor.message`. The thunk is
 * evaluated by valibot at issue-construction time, after admin's
 * boot has run — not at schema-definition time.
 */

export type I18nResolver = (descriptor: MessageDescriptor) => string;

let currentResolver: I18nResolver | null = null;

/** Register the descriptor resolver. Admin calls this from `bootI18n`
 *  with a Lingui-backed implementation. Server-side bundles never
 *  call this; their `vMessage` calls fall back to `descriptor.message`.
 *  Passing `null` un-registers — useful for test isolation. */
export function setI18nResolver(resolver: I18nResolver | null): void {
  currentResolver = resolver;
}

/** Wrap a `MessageDescriptor` for valibot's message slot. The returned
 *  function resolves the descriptor when called — through the
 *  registered resolver if one is set, otherwise via the source-locale
 *  `descriptor.message` (or `descriptor.id` as a final fallback). */
export function vMessage(descriptor: MessageDescriptor): () => string {
  return () => {
    if (currentResolver !== null) return currentResolver(descriptor);
    return descriptor.message ?? descriptor.id;
  };
}
