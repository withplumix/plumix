import type { TelemetryConsumer } from "../context/telemetry.js";

/**
 * A telemetry consumer that exists only to activate the collector in dev, so
 * the dev error page has request / query / timeline context to show even when
 * the debug bar is turned off (#1574). It votes to sample every request (no
 * `sample`) and reads the live collector at the dispatcher catch, so it needs
 * no `onRequestEnd`. Referenced only under the `process.env.PLUMIX_DEV` gate
 * and dead-code-eliminated from production builds.
 */
export function devErrorTelemetryConsumer(): TelemetryConsumer {
  return { id: "dev-error-page" };
}
