---
"@plumix/core": minor
"@plumix/runtime-cloudflare": minor
"plumix": minor
---

Add the telemetry consumer contract and split the collection gate off the debug bar. A site operator registers consumers once in app config and receives a JSON-serializable snapshot of every sampled request post-response:

```ts
plumix({
  telemetry: {
    consumers: [
      {
        id: "my-exporter",
        sample: (ctx) => Math.random() < 0.1, // head-sampling; omitted = always
        onRequestEnd: async (snapshot, ctx) => {
          /* envelope + span tree + records + dropped counters */
        },
      },
    ],
  },
});
```

- The collector core is now always present in production bundles and activates per request iff at least one registered consumer votes yes — with no consumers it stays the no-op and production pays nothing. The debug-bar UI remains dev-only and dead-code-eliminated; in dev it registers as the first consumer.
- `TelemetrySnapshot` carries a request envelope (`requestId`, `method`, `url`, `status`, `startedAt`, `durationMs`), root spans, timestamped records by namespace, and dropped counters. Delivery rides `ctx.defer` — `waitUntil` on the Cloudflare adapter — so export I/O never blocks the response; a 500 still delivers its snapshot.
- New public types from `@plumix/core`: `TelemetryConsumer`, `TelemetrySnapshot`, `TelemetryRequestEnvelope`, `TelemetryConfig` (plus the existing span/record types are now exported).
- The collector no longer source-drops namespaces for disabled debug-bar panels — panel disable stays a render-time filter; data collection is consumer-owned.
