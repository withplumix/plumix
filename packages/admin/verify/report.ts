import type { Redirect } from "./route.js";
import type { StepsOutcome } from "./steps.js";
import { redirectOf } from "./route.js";

export type PageEvent =
  | {
      readonly kind: "console";
      /** Playwright's `ConsoleMessage.type()`: `error`, `warning`, `log`, … */
      readonly type: string;
      readonly text: string;
      readonly location?: string;
    }
  | { readonly kind: "pageerror"; readonly message: string }
  | {
      readonly kind: "response";
      readonly method: string;
      readonly url: string;
      readonly status: number;
    }
  | {
      readonly kind: "requestfailed";
      readonly method: string;
      readonly url: string;
      /** Playwright's `Request.failure().errorText`. */
      readonly failure: string;
    };

interface ConsoleMessage {
  readonly text: string;
  readonly location?: string;
}

/** `status` when the server answered, `failure` when nothing did. */
type FailedRequest =
  | { readonly method: string; readonly url: string; readonly status: number }
  | { readonly method: string; readonly url: string; readonly failure: string };

/** The fields of an axe-core `Result` the report keeps. */
export interface AxeViolation {
  readonly id: string;
  readonly impact?: string | null;
  readonly help: string;
  readonly helpUrl: string;
  readonly nodes: readonly { readonly target: readonly unknown[] }[];
}

interface AxeViolationSummary {
  readonly id: string;
  readonly impact?: string | null;
  readonly help: string;
  readonly helpUrl: string;
  /** One CSS selector path per offending element. */
  readonly targets: readonly string[];
}

export interface VerifyReport {
  readonly finalUrl: string;
  readonly redirected?: Redirect;
  readonly consoleErrors: readonly ConsoleMessage[];
  readonly consoleWarnings: readonly ConsoleMessage[];
  readonly failedRequests: readonly FailedRequest[];
  readonly axeViolations: readonly AxeViolationSummary[];
  /** Present when the run was given `--steps`. */
  readonly steps?: StepsOutcome;
}

const FIRST_ERROR_STATUS = 400;

function consoleError(event: PageEvent): readonly ConsoleMessage[] {
  if (event.kind === "pageerror") return [{ text: event.message }];
  if (event.kind === "console" && event.type === "error") {
    return [{ text: event.text, location: event.location }];
  }
  return [];
}

function consoleWarning(event: PageEvent): readonly ConsoleMessage[] {
  if (event.kind === "console" && event.type === "warning") {
    return [{ text: event.text, location: event.location }];
  }
  return [];
}

function failedRequest(event: PageEvent): readonly FailedRequest[] {
  if (event.kind === "response" && event.status >= FIRST_ERROR_STATUS) {
    return [{ method: event.method, url: event.url, status: event.status }];
  }
  if (event.kind === "requestfailed") {
    return [{ method: event.method, url: event.url, failure: event.failure }];
  }
  return [];
}

function summarizeViolation(violation: AxeViolation): AxeViolationSummary {
  return {
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    helpUrl: violation.helpUrl,
    targets: violation.nodes.map((node) => node.target.join(" ")),
  };
}

export function buildReport(input: {
  readonly route: string;
  readonly finalUrl: string;
  readonly events: readonly PageEvent[];
  readonly axeViolations: readonly AxeViolation[];
}): VerifyReport {
  return {
    finalUrl: input.finalUrl,
    redirected: redirectOf(input.route, input.finalUrl),
    consoleErrors: input.events.flatMap(consoleError),
    consoleWarnings: input.events.flatMap(consoleWarning),
    failedRequests: input.events.flatMap(failedRequest),
    axeViolations: input.axeViolations.map(summarizeViolation),
  };
}

/**
 * What fails the run: an error, a failed step, or ending away from
 * `expectedRoute`, where an alias that ends on its target has arrived. A
 * warning fails nothing.
 */
export function hasProblems(
  report: VerifyReport,
  expectedRoute: string,
): boolean {
  return (
    redirectOf(expectedRoute, report.finalUrl) !== undefined ||
    report.consoleErrors.length > 0 ||
    report.failedRequests.length > 0 ||
    report.axeViolations.length > 0 ||
    (report.steps?.failed.length ?? 0) > 0
  );
}
