import { describe, expect, it } from "vitest";

import type { VerifyReport } from "./report.js";
import { buildReport, hasProblems } from "./report.js";

const FINAL_URL = "http://localhost:4000/_plumix/admin/users";

describe("buildReport", () => {
  it("reports a console error with where it was logged", () => {
    const report = buildReport({
      finalUrl: FINAL_URL,
      events: [
        {
          kind: "console",
          type: "error",
          text: "Failed to load plugin chunk",
          location: "http://localhost:4000/_plumix/admin/assets/index.js:12",
        },
      ],
      axeViolations: [],
    });

    expect(report.consoleErrors).toEqual([
      {
        text: "Failed to load plugin chunk",
        location: "http://localhost:4000/_plumix/admin/assets/index.js:12",
      },
    ]);
  });

  it("reports a console warning apart from the errors", () => {
    const report = buildReport({
      finalUrl: FINAL_URL,
      events: [{ kind: "console", type: "warning", text: "Deprecated prop" }],
      axeViolations: [],
    });

    expect(report).toMatchObject({
      consoleErrors: [],
      consoleWarnings: [{ text: "Deprecated prop" }],
    });
  });

  it("reports an uncaught exception as a console error", () => {
    const report = buildReport({
      finalUrl: FINAL_URL,
      events: [
        {
          kind: "pageerror",
          message: "TypeError: Cannot read properties of undefined",
        },
      ],
      axeViolations: [],
    });

    expect(report.consoleErrors).toEqual([
      { text: "TypeError: Cannot read properties of undefined" },
    ]);
  });

  it("reports a response with a 4xx or 5xx status as a failed request", () => {
    const report = buildReport({
      finalUrl: FINAL_URL,
      events: [
        {
          kind: "response",
          method: "POST",
          url: "http://localhost:4000/_plumix/rpc/user/list",
          status: 403,
        },
        {
          kind: "response",
          method: "GET",
          url: "http://localhost:4000/_plumix/admin/plugins/site-bundle.js",
          status: 500,
        },
      ],
      axeViolations: [],
    });

    expect(report.failedRequests).toEqual([
      {
        method: "POST",
        url: "http://localhost:4000/_plumix/rpc/user/list",
        status: 403,
      },
      {
        method: "GET",
        url: "http://localhost:4000/_plumix/admin/plugins/site-bundle.js",
        status: 500,
      },
    ]);
  });

  it("counts a request as failed from status 400 up, not a success or a redirect", () => {
    const report = buildReport({
      finalUrl: FINAL_URL,
      events: [200, 302, 399, 400].map((status) => ({
        kind: "response" as const,
        method: "GET",
        url: `http://localhost:4000/${String(status)}`,
        status,
      })),
      axeViolations: [],
    });

    expect(report.failedRequests).toEqual([
      { method: "GET", url: "http://localhost:4000/400", status: 400 },
    ]);
  });

  it("reports a request that got no response, with why", () => {
    const report = buildReport({
      finalUrl: FINAL_URL,
      events: [
        {
          kind: "requestfailed",
          method: "GET",
          url: "http://localhost:4000/_plumix/admin/plugins/site-bundle.js",
          failure: "net::ERR_CONNECTION_REFUSED",
        },
      ],
      axeViolations: [],
    });

    expect(report.failedRequests).toEqual([
      {
        method: "GET",
        url: "http://localhost:4000/_plumix/admin/plugins/site-bundle.js",
        failure: "net::ERR_CONNECTION_REFUSED",
      },
    ]);
  });

  it("reports each axe violation with the elements it found it on", () => {
    const report = buildReport({
      finalUrl: FINAL_URL,
      events: [],
      axeViolations: [
        {
          id: "color-contrast",
          impact: "serious",
          help: "Elements must meet minimum color contrast ratio thresholds",
          helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
          nodes: [
            { target: ["[data-testid='users-heading']"] },
            { target: ["#root", "button.primary"] },
          ],
        },
      ],
    });

    expect(report.axeViolations).toEqual([
      {
        id: "color-contrast",
        impact: "serious",
        help: "Elements must meet minimum color contrast ratio thresholds",
        helpUrl: "https://dequeuniversity.com/rules/axe/4.10/color-contrast",
        targets: ["[data-testid='users-heading']", "#root button.primary"],
      },
    ]);
  });
});

describe("hasProblems", () => {
  const clean: VerifyReport = {
    finalUrl: FINAL_URL,
    consoleErrors: [],
    consoleWarnings: [],
    failedRequests: [],
    axeViolations: [],
  };

  it.each<[string, Partial<VerifyReport>]>([
    ["a console error", { consoleErrors: [{ text: "boom" }] }],
    [
      "a failed request",
      { failedRequests: [{ method: "GET", url: FINAL_URL, status: 500 }] },
    ],
    [
      "an axe violation",
      {
        axeViolations: [
          {
            id: "label",
            impact: "critical",
            help: "Form elements must have labels",
            helpUrl: "https://dequeuniversity.com/rules/axe/4.10/label",
            targets: ["input"],
          },
        ],
      },
    ],
  ])("is true for %s", (_, findings) => {
    expect(hasProblems({ ...clean, ...findings })).toBe(true);
  });

  it("is false for a report with only console warnings", () => {
    expect(
      hasProblems({ ...clean, consoleWarnings: [{ text: "Deprecated prop" }] }),
    ).toBe(false);
  });
});
