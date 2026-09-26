import { describe, expect, test } from "vitest";

import type { MergeOutcome, Ticket } from "./github.js";
import type { ShipPorts } from "./run.js";
import { runShipLoop } from "./run.js";

const ticket = (number: number): Ticket => ({ number, title: `t${number}` });

const merged: MergeOutcome = { status: "merged" };
const ciRed: MergeOutcome = {
  status: "failed",
  reason: "failing checks: Test",
  failingChecks: ["Test"],
};

const ports = (over: Partial<ShipPorts> = {}) => {
  const waiting = [ticket(1), ticket(2), ticket(3)];
  const parked: { number: number; reason: string }[] = [];
  const released: number[] = [];
  const filed: string[] = [];
  const base: ShipPorts = {
    nextTicket: () => waiting.shift(),
    ship: async (t) => ({
      status: "queued",
      pullRequest: { number: 100 + t.number, url: `pr/${t.number}` },
      advisory: [],
    }),
    park: (t, reason) => void parked.push({ number: t.number, reason }),
    releaseClaim: (t) => void released.push(t.number),
    confirm: async () => merged,
    fileFollowUp: (_t, _url, f) => void filed.push(f.summary),
    ticketClosed: () => true,
    say: () => {},
  };
  return { ports: { ...base, ...over }, parked, released, filed };
};

const allLanes = { lanes: 2, withinBudget: () => true };

describe("runShipLoop", () => {
  test("a ticket whose pull request merges is reported as merged", async () => {
    const { ports: p } = ports();

    const report = await runShipLoop(p, allLanes);

    expect(report.merged.map(({ ticket: t }) => t.number)).toEqual([1, 2, 3]);
    expect(report.parked).toEqual([]);
  });

  test("a confirmation that throws does not lose the other confirmations", async () => {
    const { ports: p, parked } = ports({
      confirm: async (pr) => {
        if (pr.number === 102) throw new Error("gh pr view: connection reset");
        return merged;
      },
    });

    const report = await runShipLoop(p, allLanes);

    expect(report.merged.map(({ ticket: t }) => t.number)).toEqual([1, 3]);
    expect(parked.map(({ number }) => number)).toEqual([2]);
    expect(parked[0]?.reason).toContain("connection reset");
  });

  test("a pull request whose ci goes red parks its ticket with the failing checks", async () => {
    const { ports: p, parked } = ports({ confirm: async () => ciRed });

    const report = await runShipLoop(p, allLanes);

    expect(report.merged).toEqual([]);
    expect(parked).toHaveLength(3);
    expect(parked[0]?.reason).toContain("failing checks: Test");
  });

  test("an advisory finding is filed once the pull request has merged", async () => {
    const { ports: p, filed } = ports({
      ship: async (t) => ({
        status: "queued",
        pullRequest: { number: 100 + t.number, url: `pr/${t.number}` },
        advisory: [
          {
            severity: "medium",
            file: "a.ts",
            summary: `dup in t${t.number}`,
            why: "w",
          },
        ],
      }),
    });

    await runShipLoop(p, allLanes);

    expect(filed.sort()).toEqual(["dup in t1", "dup in t2", "dup in t3"]);
  });

  test("an advisory finding is not filed when the pull request never merged", async () => {
    const { ports: p, filed } = ports({
      confirm: async () => ciRed,
      ship: async (t) => ({
        status: "queued",
        pullRequest: { number: 100 + t.number, url: `pr/${t.number}` },
        advisory: [
          { severity: "medium", file: "a.ts", summary: "dup", why: "w" },
        ],
      }),
    });

    await runShipLoop(p, allLanes);

    expect(filed).toEqual([]);
  });

  test("a ticket blocked inside its lane is parked and never queued", async () => {
    const { ports: p, parked } = ports({
      ship: async () => ({ status: "blocked", reason: "no commits" }),
    });

    const report = await runShipLoop(p, allLanes);

    expect(report.merged).toEqual([]);
    expect(parked.map(({ reason }) => reason)).toEqual([
      "no commits",
      "no commits",
      "no commits",
    ]);
  });

  test("an outage releases the claim, parks nothing, and stops dispatching", async () => {
    const {
      ports: p,
      parked,
      released,
    } = ports({
      lanes: 1,
      ship: async () => {
        throw new Error("Claude AI usage limit reached");
      },
    } as Partial<ShipPorts>);

    const report = await runShipLoop(
      { ...p },
      { lanes: 1, withinBudget: () => true },
    );

    expect(parked).toEqual([]);
    expect(released).toEqual([1]);
    expect(report.outage).toContain("usage limit");
  });

  test("a harness failure releases the ticket and keeps the run going", async () => {
    let attempts = 0;
    const {
      ports: p,
      parked,
      released,
    } = ports({
      ship: async (t) => {
        attempts += 1;
        if (t.number === 1)
          throw new Error(
            "Command failed (exit 128): git config --global --add safe.directory\nfatal: not a git repository: /x/.git/worktrees/feat-y",
          );
        return {
          status: "queued",
          pullRequest: { number: 100 + t.number, url: `pr/${t.number}` },
          advisory: [],
        };
      },
    });

    const report = await runShipLoop(p, allLanes);

    expect(parked).toEqual([]);
    expect(released).toEqual([1]);
    expect(report.outage).toBeUndefined();
    expect(report.merged.map(({ ticket: t }) => t.number)).toEqual([2, 3]);
    expect(attempts).toBe(3);
  });

  test("a budget that has run out hands out no work at all", async () => {
    const { ports: p } = ports();

    const report = await runShipLoop(p, {
      lanes: 2,
      withinBudget: () => false,
    });

    expect(report.merged).toEqual([]);
    expect(report.parked).toEqual([]);
  });
});
