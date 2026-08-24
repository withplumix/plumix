---
"@plumix/core": minor
"@plumix/blocks": minor
"@plumix/plugin-media": minor
"@plumix/plugin-audit-log": patch
---

Types the returns that were left `unknown`. A function declaring a return type of `unknown` — or a
promise of one — is now rejected in production source by `plumix/no-unknown-return`, and the
signatures it found say what they hand back.

**Source-breaking for plugin authors** on the type level. Three sites also emit different JS, each
noted below.

- The `.sanitize()` callback on the `json()` and `entry()`/`term()`/`user()` reference builders, on
  `media()`, and on a hand-written `MetaBoxField` object returns `JsonValue`. The value is written
  to a JSON column, so this is what the write path already required — a callback returning a `Date`
  reached the driver as whatever `JSON.stringify` made of it. The typed builders (string, color,
  link, number, range, select, temporal, toggle) still take
  `(value: NonNullable<V>) => NonNullable<V>` and are unaffected for callers.
- `LinkValue` is a `type` alias rather than an `interface`, so a link value assigns to `JsonObject`
  (TypeScript withholds the implicit index signature from an interface).
- A telemetry record's `data` is `JsonValue`, and `TelemetryCollector.record` takes
  `JsonValue | (() => JsonValue)` — matching `TelemetrySpanHandle.set`, which already did. The
  debug bar still sanitizes at read time, since nothing checks the type at runtime.
- The read-error mappers (`toRpcEntryReadError`, `toRpcTermReadError`) return `Error | undefined`
  instead of passing a foreign error through: `undefined` means "not mine to translate", and the
  caller rethrows what it caught. This removes a latent `throw undefined` on an unrecognized error
  code.

One further behaviour change, in a forgiving-read fallback: a meta value stored as an object or
array under a field since narrowed to `string` now reads back as its JSON rather than as
`"[object Object]"` or `"a,b"`.
