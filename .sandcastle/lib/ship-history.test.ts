import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ShipHistory } from "./ship-history.js";

const roots: string[] = [];

function historyRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "ship-history-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  vi.useRealTimers();
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true }));
});

describe("ShipHistory", () => {
  test("a complete record with invalid identifiers stops recovery", () => {
    const root = historyRoot();
    const previous = new ShipHistory(root);
    appendFileSync(
      previous.path,
      '{"type":"pr.tracked","ticket":{"number":3450,"title":"fix saving"},"pullRequest":{"number":null,"url":"pr/3501"}}\n',
    );

    expect(() => new ShipHistory(root)).toThrow(
      `Cannot recover ${previous.path}:2`,
    );
  });

  test("a run interrupted before creating its event file does not prevent recovery", () => {
    const root = historyRoot();
    const abandoned = join(root, "runs", "ship-1");
    mkdirSync(abandoned, { recursive: true });

    const restarted = new ShipHistory(root);

    expect(restarted.pending()).toEqual([]);
    expect(restarted.incompleteFiles).toEqual([
      join(abandoned, "events.jsonl"),
    ]);
  });

  test("runs created in the same millisecond replay in creation order", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T20:00:00.000Z"));
    const root = historyRoot();
    const previous = new ShipHistory(root);
    previous.record({
      type: "pr.tracked",
      ticket: { number: 3450, title: "fix saving" },
      pullRequest: { number: 3501, url: "pr/3501" },
    });
    const second = new ShipHistory(root);
    second.record({ type: "delivery.merged", issue: 3450 });

    const restarted = new ShipHistory(root);

    expect(restarted.pending()).toEqual([]);
  });

  test("a new run recovers a tracked pull request from the previous run", () => {
    const root = historyRoot();
    const previous = new ShipHistory(root);
    previous.record({
      type: "pr.tracked",
      ticket: { number: 3450, title: "fix saving" },
      pullRequest: { number: 3501, url: "https://github.com/o/r/pull/3501" },
    });

    const restarted = new ShipHistory(root);

    expect(restarted.pending()).toEqual([
      {
        ticket: { number: 3450, title: "fix saving" },
        pullRequest: { number: 3501, url: "https://github.com/o/r/pull/3501" },
        repairs: 0,
        rebases: 0,
      },
    ]);
    expect(restarted.path).not.toBe(previous.path);
  });

  test("repair and rebase budgets survive a restart and a repeated PR observation", () => {
    const root = historyRoot();
    const previous = new ShipHistory(root);
    const tracked = {
      type: "pr.tracked",
      ticket: { number: 3450, title: "fix saving" },
      pullRequest: { number: 3501, url: "pr/3501" },
    } as const;
    previous.record(tracked);
    previous.record({ type: "repair.started", issue: 3450 });
    previous.record({ type: "rebase.started", issue: 3450 });
    const restarted = new ShipHistory(root);

    restarted.record(tracked);

    expect(restarted.pending()[0]).toEqual({
      ticket: { number: 3450, title: "fix saving" },
      pullRequest: { number: 3501, url: "pr/3501" },
      repairs: 1,
      rebases: 1,
    });
  });

  test.each(["delivery.merged", "delivery.parked"] as const)(
    "%s is terminal when the next run reads the journal",
    (type) => {
      const root = historyRoot();
      const previous = new ShipHistory(root);
      previous.record({
        type: "pr.tracked",
        ticket: { number: 3450, title: "fix saving" },
        pullRequest: { number: 3501, url: "pr/3501" },
      });
      previous.record({ type, issue: 3450, reason: "finished" });

      const restarted = new ShipHistory(root);

      expect(restarted.pending()).toEqual([]);
    },
  );

  test("an implementation interrupted before opening a PR keeps its branch for reconciliation", () => {
    const root = historyRoot();
    const previous = new ShipHistory(root);
    previous.record({
      type: "delivery.started",
      ticket: { number: 3450, title: "fix saving" },
      branch: "feat/fix-saving-3450",
    });

    const restarted = new ShipHistory(root);

    expect(restarted.pending()).toEqual([
      {
        ticket: { number: 3450, title: "fix saving" },
        branch: "feat/fix-saving-3450",
        repairs: 0,
        rebases: 0,
      },
    ]);
  });

  test("an interrupted final write keeps earlier complete events and names the incomplete journal", () => {
    const root = historyRoot();
    const previous = new ShipHistory(root);
    previous.record({
      type: "pr.tracked",
      ticket: { number: 3450, title: "fix saving" },
      pullRequest: { number: 3501, url: "pr/3501" },
    });
    appendFileSync(previous.path, '{"type":"repair.started"');

    const restarted = new ShipHistory(root);

    expect(restarted.pending()[0]?.repairs).toBe(0);
    expect(restarted.incompleteFiles).toEqual([previous.path]);
  });

  test("a complete corrupt record stops recovery instead of silently resetting a budget", () => {
    const root = historyRoot();
    const previous = new ShipHistory(root);
    appendFileSync(previous.path, '{"type":"unknown"}\n');

    expect(() => new ShipHistory(root)).toThrow(
      `Cannot recover ${previous.path}:2`,
    );
  });
});
