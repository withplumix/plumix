import type { TelemetryConsumer } from "../../context/telemetry.js";
import type { NormalizedDebugBar } from "./config.js";

/**
 * Registers so the collector is active for the request the bar renders; the
 * bar reads the live collector mid-render, so there is no `onRequestEnd`.
 */
export function debugBarTelemetryConsumer(
  bar: NormalizedDebugBar,
): TelemetryConsumer | null {
  return bar.enabled ? { id: "debug-bar" } : null;
}
