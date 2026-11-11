import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

import { measureHistory } from "./operations.js";
import { ShipHistory } from "./ship-history.js";

test("reports retain failed work and mark unmeasured usage", () => {
  const root = mkdtempSync(join(tmpdir(), "ship-operations-"));
  try {
    const history = new ShipHistory(root);
    history.record({
      type: "delivery.started",
      ticket: { number: 1, title: "fix" },
      branch: "feat/fix",
    });
    history.record({
      type: "phase.finished",
      issue: 1,
      journalRunId: "attempt",
      phase: {
        phase: "implement",
        kind: "agent",
        startedAt: new Date().toISOString(),
        durationMs: 100,
        outcome: "error",
      },
    });
    history.record({
      type: "phase.finished",
      issue: 1,
      journalRunId: "retry",
      phase: {
        phase: "implement",
        kind: "agent",
        startedAt: new Date().toISOString(),
        durationMs: 200,
        outcome: "ok",
        notionalCostUsd: 2,
      },
    });
    history.record({ type: "delivery.merged", issue: 1 });
    expect(measureHistory(history)).toMatchObject({
      merged: 1,
      pending: 0,
      agentFailures: 1,
      agentMs: 300,
      knownNotionalCostUsd: 2,
      unmeasuredAgentPhases: 1,
    });
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("reading status replays journals without creating a run", () => {
  const root = mkdtempSync(join(tmpdir(), "ship-operations-"));
  try {
    const writer = new ShipHistory(root);
    writer.record({
      type: "delivery.started",
      ticket: { number: 1, title: "fix" },
      branch: "feat/fix",
    });
    const before = readdirSync(join(root, "runs"));
    const reader = new ShipHistory(root, "read");
    expect(reader.pending().map(({ ticket }) => ticket.number)).toEqual([1]);
    expect(readdirSync(join(root, "runs"))).toEqual(before);
    expect(() => reader.record({ type: "ship.finished" })).toThrow("read-only");
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("transcript cursors survive a coordinator restart", () => {
  const root = mkdtempSync(join(tmpdir(), "ship-operations-"));
  try {
    const history = new ShipHistory(root);
    history.record({
      type: "phase.finished",
      issue: 1,
      journalRunId: "attempt",
      phase: {
        phase: "implement",
        kind: "agent",
        startedAt: new Date().toISOString(),
        durationMs: 1,
        outcome: "ok",
        usageCursors: [["session.jsonl", 42]],
      },
    });
    expect(
      new ShipHistory(root, "read").usageCursors.get("session.jsonl"),
    ).toBe(42);
  } finally {
    rmSync(root, { recursive: true });
  }
});
