import type { TelemetryConsumer } from "../../context/telemetry.js";
import type { DebugBarInput } from "./config.js";
import { normalizeDebugBar } from "./config.js";

/**
 * The debug bar as a telemetry consumer — it registers so the collector is
 * active for the request the bar renders. It has no `onRequestEnd`: the bar
 * reads the live collector mid-request while rendering. Returns null when the
 * bar is configured off, which no longer decides whether the request is
 * collected at all — the request-history writer registers either way (#2369).
 * Referenced only under the `PLUMIX_DEV` gate and dead-code-eliminated from
 * production builds.
 */
export function debugBarTelemetryConsumer(
  debugBar: DebugBarInput | undefined,
): TelemetryConsumer | null {
  return normalizeDebugBar(debugBar).enabled ? { id: "debug-bar" } : null;
}
