import type { DevErrorFrame, ForwardedLog } from "@plumix/core/dev-client";

/** Has no request id: a client error has no server request behind it. */
export interface RetainedClientError {
  readonly source: "client";
  readonly level: ForwardedLog["level"];
  readonly message: string;
  readonly stack: readonly DevErrorFrame[];
  readonly label?: string;
}

/** Fixed capacity, drop-oldest, total-byte budget and per-string truncation. */
export interface ClientErrorRing {
  /** Retain one resolved entry; strings are truncated and the ring bounded. */
  add(entry: RetainedClientError): void;
  /** Every retained entry, newest first. */
  get(): readonly RetainedClientError[];
}

export interface ClientErrorRingOptions {
  /** Ring capacity; drop-oldest past it. */
  readonly maxEntries?: number;
  /** Total-byte budget across the ring; evict oldest past it (newest kept). */
  readonly maxTotalBytes?: number;
  /** Individual string cap; longer values are truncated at capture. */
  readonly maxStringLength?: number;
}

/**
 * Client failures burst, so the entry cap is generous; the byte budget stops
 * one huge entry pinning memory.
 */
const DEFAULT_MAX_ENTRIES = 50;
const DEFAULT_MAX_TOTAL_BYTES = 500_000;
const DEFAULT_MAX_STRING_LENGTH = 8_192;

export function createClientErrorRing(
  options: ClientErrorRingOptions = {},
): ClientErrorRing {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const maxStringLength = options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;

  // Oldest-first; `bytes` keeps the budget an O(1) running total.
  const ring: { entry: RetainedClientError; bytes: number }[] = [];
  let totalBytes = 0;

  function evictOldest(): void {
    const oldest = ring.shift();
    if (oldest) totalBytes -= oldest.bytes;
  }

  return {
    add(entry) {
      const bounded = boundStrings(entry, maxStringLength);
      const bytes = JSON.stringify(bounded).length;
      ring.push({ entry: bounded, bytes });
      totalBytes += bytes;

      // Hard count cap first, then the byte budget — but never evict the
      // just-added entry, so a lone oversized error still shows up.
      while (ring.length > maxEntries) evictOldest();
      while (ring.length > 1 && totalBytes > maxTotalBytes) evictOldest();
    },
    get() {
      return ring.map((slot) => slot.entry).reverse();
    },
  };
}

/** Per-string cap so one giant value can't exhaust the byte budget alone. */
function boundStrings(
  entry: RetainedClientError,
  maxString: number,
): RetainedClientError {
  return {
    source: entry.source,
    level: entry.level,
    message: truncate(entry.message, maxString),
    stack: entry.stack.map((frame) => boundFrame(frame, maxString)),
    ...(entry.label !== undefined
      ? { label: truncate(entry.label, maxString) }
      : {}),
  };
}

function boundFrame(frame: DevErrorFrame, maxString: number): DevErrorFrame {
  return {
    ...frame,
    file: truncate(frame.file, maxString),
    ...(frame.functionName !== undefined
      ? { functionName: truncate(frame.functionName, maxString) }
      : {}),
  };
}

function truncate(text: string, maxString: number): string {
  if (text.length <= maxString) return text;
  const dropped = text.length - maxString;
  return `${text.slice(0, maxString)}… [${dropped} chars truncated]`;
}
