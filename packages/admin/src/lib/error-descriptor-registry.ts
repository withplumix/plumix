import type { MessageDescriptor } from "@lingui/core";

import { useLabel } from "./use-label.js";

// Factories for the wire-error-code → `MessageDescriptor` registry
// pattern shared by every admin module that maps a server-emitted
// error code to a localizable user-facing string.
//
// Two variants because the call shapes legitimately diverge:
//
// - `createNullableErrorDescriptorRegistry` — the code arrives from
//   a URL search param or other optional source. `undefined` /
//   empty inputs return `null` so the consumer can skip rendering
//   the alert. Unknown codes fall through to a separate `fallback`
//   descriptor. Used by magic-link / oauth / email-change.
// - `createStrictErrorDescriptorRegistry` — the code is always
//   present (caught from a thrown error class). Unknown codes fall
//   through to the `fallbackKey` entry inside the table itself, so
//   every code (including `unknown`) is owned by one map. Used by
//   passkey-errors.

interface NullableRegistry<TCode extends string> {
  readonly descriptor: (code: string | undefined) => MessageDescriptor | null;
  readonly useMessage: () => (code: string | undefined) => string | null;
  /** Test-only — iterate `<Code>` keys to assert exhaustive coverage. */
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
