import type { TelemetryConsumer } from "../context/telemetry.js";
import type { DebugBarInput } from "./config.js";
import { normalizeDebugBar } from "./config.js";

/**
 * The debug bar as a telemetry consumer — the first one registered in dev, so
 * the collector activates for the request the bar renders. It has no
 * `onRequestEnd`: the bar reads the live collector mid-request while
 * rendering. Returns null when the bar is configured off, so a disabled bar
 * costs no collection either. Referenced only under the `PLUMIX_DEV` gate and
 * dead-code-eliminated from production builds.
 */
export function debugBarTelemetryConsumer(
  debugBar: DebugBarInput | undefined,
): TelemetryConsumer | null {
  return normalizeDebugBar(debugBar).enabled ? { id: "debug-bar" } : null;
}
