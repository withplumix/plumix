import type { DevErrorFrame, ForwardedLog } from "@plumix/blocks/dev-error";

/**
 * One forwarded client failure retained for read-back (#1656). The forwarder
 * already sourcemaps each stack to original-source {@link DevErrorFrame}s before
 * printing it to the terminal; this keeps that resolved entry so a later reader —
 * the dev-only MCP `error_list` tool (#1653) — can pull it without re-running the
 * browser. It carries only what an agent reads: `source` (always `client`, the
 * merge discriminator against server errors), `level`, `message`, the resolved
 * `stack`, and the island/component `label` when the failure named one. It has no
 * request id — a client error has no server request behind it.
 */
export interface RetainedClientError {
  readonly source: "client";
  readonly level: ForwardedLog["level"];
  readonly message: string;
  readonly stack: readonly DevErrorFrame[];
  readonly label?: string;
}

/**
 * A bounded ring of the most recent forwarded client errors, mirroring the
 * server-side request-history store's bounding contract (fixed capacity,
 * drop-oldest, total-byte budget, per-string truncation). Dev-only and held on
 * the forwarder for the dev session; it tree-shakes out of production with the
 * rest of the forwarder.
 */
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

// Client failures are small and can burst (a render loop, a chatty warning), so
// the entry cap is generous while the byte budget guards a pathological single
// entry from pinning memory. Dev-only, so the numbers favour usefulness.
const DEFAULT_MAX_ENTRIES = 50;
const DEFAULT_MAX_TOTAL_BYTES = 500_000;
const DEFAULT_MAX_STRING_LENGTH = 8_192;

export function createClientErrorRing(
  options: ClientErrorRingOptions = {},
): ClientErrorRing {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const maxStringLength = options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH;

  // Oldest-first internally (push appends); `get` reverses to newest-first.
  // `bytes` is the entry's approximate serialized size, tracked so the byte
  // budget is an O(1) running total rather than a re-measure per add.
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

// Truncate every string on the entry — the client-controlled `message`/`label`
// and the server-derived frame paths — so one giant value can't blow the byte
// budget on its own. Mirrors the request-history store's per-string cap.
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
