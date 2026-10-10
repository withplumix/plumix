import type { MessageDescriptor } from "@lingui/core";

import { useLabel } from "./use-label.js";

// Nullable: an optional code (a URL param) yields `null` when absent. Strict:
// the code is always present, and unknown codes use the table's own
// `fallbackKey`.

interface NullableRegistry<TCode extends string> {
  readonly descriptor: (code: string | undefined) => MessageDescriptor | null;
  readonly useMessage: () => (code: string | undefined) => string | null;
  /** Test-only. */
  readonly _messages: Record<TCode, MessageDescriptor>;
}

interface StrictRegistry<TCode extends string> {
  readonly descriptor: (code: string) => MessageDescriptor;
  readonly useMessage: () => (code: string) => string;
  readonly _messages: Record<TCode, MessageDescriptor>;
}

export function createNullableErrorDescriptorRegistry<TCode extends string>(
  messages: Record<TCode, MessageDescriptor>,
  fallback: MessageDescriptor,
): NullableRegistry<TCode> {
  function descriptor(code: string | undefined): MessageDescriptor | null {
    if (!code) return null;
    return Object.hasOwn(messages, code) ? messages[code as TCode] : fallback;
  }
  function useMessage(): (code: string | undefined) => string | null {
    const label = useLabel();
    return (code) => {
      const d = descriptor(code);
      if (d === null) return null;
      return label(d);
    };
  }
  return { descriptor, useMessage, _messages: messages };
}

export function createStrictErrorDescriptorRegistry<TCode extends string>(
  messages: Record<TCode, MessageDescriptor>,
  fallbackKey: TCode,
): StrictRegistry<TCode> {
  function descriptor(code: string): MessageDescriptor {
    return Object.hasOwn(messages, code)
      ? messages[code as TCode]
      : messages[fallbackKey];
  }
  function useMessage(): (code: string) => string {
    const label = useLabel();
    return (code) => label(descriptor(code));
  }
  return { descriptor, useMessage, _messages: messages };
}
