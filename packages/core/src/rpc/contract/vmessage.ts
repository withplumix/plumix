import type { MessageDescriptor } from "@lingui/core";

/**
 * The thunk resolves when valibot builds the issue, after admin's
 * `bootI18n` has registered a resolver. Server bundles never register and
 * fall back to `descriptor.message`.
 */
export type I18nResolver = (descriptor: MessageDescriptor) => string;

let currentResolver: I18nResolver | null = null;

/** Passing `null` un-registers. */
export function setI18nResolver(resolver: I18nResolver | null): void {
  currentResolver = resolver;
}

/**
 * Falls back to `descriptor.message`, then `descriptor.id`, when no
 * resolver is registered.
 */
export function vMessage(descriptor: MessageDescriptor): () => string {
  return () => {
    if (currentResolver !== null) return currentResolver(descriptor);
    return descriptor.message ?? descriptor.id;
  };
}
