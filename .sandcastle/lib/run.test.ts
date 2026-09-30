import { describe, expect, test } from "vitest";

import type { MergeOutcome, Ticket } from "./github.js";
import type { ShipPorts } from "./run.js";
import { drainingFrom } from "./lanes.js";
import { REPAIRS_A_PULL_REQUEST_GETS, runShipLoop } from "./run.js";

const ticket = (number: number): Ticket => ({ number, title: `t${number}` });

const merged: MergeOutcome = { status: "merged" };
const ciRed: MergeOutcome = {
  status: "failed",
  reason: "failing checks: Test",
  failingChecks: [{ name: "Test" }],
};

const ports = (over: Partial<ShipPorts> = {}) => {
  const waiting = [ticket(1), ticket(2), ticket(3)];
  const parked: { number: number; reason: string }[] = [];
  const released: number[] = [];
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
    repair: async () => ({ status: "repaired" }) as const,
    rerunFailedChecks: async () => true,
    inFlightFromEarlierRuns: () => [],
    requeue: () => {},
    ticketClosed: () => true,
    say: () => {},
  };
  return { ports: { ...base, ...over }, parked, released };
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

  test("the session limit leaves every ticket exactly as it was", async () => {
    const {
      ports: p,
      parked,
      released,
    } = ports({
      ship: async () => {
        throw new Error(
          "claude-code exited with code 1: You've hit your session limit · reset 3pm",
        );
      },
    });

    const report = await runShipLoop(p, allLanes);

    expect(parked).toEqual([]);
    expect(released.length).toBeGreaterThan(0);
    expect(report.outage).toContain("session limit");
  });

  test("a session limit hitting every lane is an outage, not tickets failing in a row", async () => {
    const waiting = [1, 2, 3].map(ticket);
    const { ports: p } = ports({
      nextTicket: () => waiting.shift(),
      ship: async () => {
        throw new Error(
          "claude-code exited with code 1:\nYou've hit your session limit · resets 10pm (UTC)",
        );
      },
    });

    const report = await runShipLoop(p, { lanes: 3, withinBudget: () => true });

    expect(report.outage).toContain("session limit");
    expect(report.stoppedBecause).toBeUndefined();
  });

  test("three failures in a row stop the run, leaving the rest of the queue alone", async () => {
    const waiting = [1, 2, 3, 4, 5, 6, 7, 8].map(ticket);
    const attempted: number[] = [];
    const { ports: p, parked } = ports({
      nextTicket: () => waiting.shift(),
      ship: async (t) => {
        attempted.push(t.number);
        return { status: "blocked", reason: "gate red" };
      },
    });

    await runShipLoop(p, { lanes: 1, withinBudget: () => true });

    expect(attempted).toEqual([1, 2, 3]);
    expect(parked).toHaveLength(3);
    expect(waiting.map(({ number }) => number)).toEqual([4, 5, 6, 7, 8]);
  });

  test("three throws in a row stop the run without parking anything", async () => {
    const waiting = [1, 2, 3, 4, 5, 6].map(ticket);
    const attempted: number[] = [];
    const {
      ports: p,
      parked,
      released,
    } = ports({
      nextTicket: () => waiting.shift(),
      ship: async (t) => {
        attempted.push(t.number);
        throw new Error("docker: Cannot connect to the Docker daemon");
      },
    });

    await runShipLoop(p, { lanes: 1, withinBudget: () => true });

    expect(attempted).toEqual([1, 2, 3]);
    expect(parked).toEqual([]);
    expect(released).toEqual([1, 2, 3]);
  });

  test("a ticket that lands resets the count, so unlucky tickets do not stop a healthy run", async () => {
    const waiting = [1, 2, 3, 4, 5].map(ticket);
    const attempted: number[] = [];
    const { ports: p } = ports({
      nextTicket: () => waiting.shift(),
      ship: async (t) => {
        attempted.push(t.number);
        if (t.number % 2 === 1)
          return { status: "blocked", reason: "gate red" };
        return {
          status: "queued",
          pullRequest: { number: 100 + t.number, url: `pr/${t.number}` },
          advisory: [],
        };
      },
    });

    await runShipLoop(p, { lanes: 1, withinBudget: () => true });

    expect(attempted).toEqual([1, 2, 3, 4, 5]);
  });

  test("a pull request that is refused is repaired, requeued and merges", async () => {
    const seen: string[] = [];
    let attempts = 0;
    const { ports: p, parked } = ports({
      rerunFailedChecks: async () => false,
      confirm: async () => {
        attempts += 1;
        return attempts <= 3 ? ciRed : merged;
      },
      repair: async () => {
        seen.push("repaired");
        return { status: "repaired" } as const;
      },
      requeue: () => void seen.push("requeued"),
    });

    const report = await runShipLoop(p, allLanes);

    expect(seen.filter((s) => s === "repaired")).toHaveLength(3);
    expect(seen.filter((s) => s === "requeued")).toHaveLength(3);
    expect(report.merged).toHaveLength(3);
    expect(parked).toEqual([]);
  });

  test("the repair is handed what the queue refused, so the fixer sees what CI saw", async () => {
    const handed: MergeOutcome[] = [];
    let attempts = 0;
    const { ports: p } = ports({
      rerunFailedChecks: async () => false,
      nextTicket: drainingFrom([ticket(1)]),
      confirm: async () => (++attempts === 1 ? ciRed : merged),
      repair: async (_ticket, _pr, refusal) => {
        handed.push(refusal);
        return { status: "repaired" } as const;
      },
    });

    await runShipLoop(p, allLanes);

    expect(handed).toEqual([ciRed]);
  });

  test("a pull request still refused after every repair is parked with the last refusal", async () => {
    let repairs = 0;
    const { ports: p, parked } = ports({
      nextTicket: drainingFrom([ticket(1)]),
      confirm: async () => ciRed,
      repair: async () => {
        repairs += 1;
        return { status: "repaired" } as const;
      },
    });

    await runShipLoop(p, allLanes);

    expect(repairs).toBe(REPAIRS_A_PULL_REQUEST_GETS);
    expect(parked).toHaveLength(1);
    expect(parked[0]?.reason).toContain("failing checks");
  });

  test("a repair the fixer declines parks at once, with the fixer's reason", async () => {
    let repairs = 0;
    const { ports: p, parked } = ports({
      nextTicket: drainingFrom([ticket(1)]),
      confirm: async () => ciRed,
      repair: async () => {
        repairs += 1;
        return {
          status: "declined",
          reason:
            "code scanning flags a build-time path; a person must dismiss it",
        } as const;
      },
    });

    await runShipLoop(p, allLanes);

    expect(repairs).toBe(1);
    expect(parked[0]?.reason).toContain("a person must dismiss it");
  });

  test("a failure the fixer shows is not the branch's is re-run instead of parked", async () => {
    const seen: string[] = [];
    let confirms = 0;
    const { ports: p, parked } = ports({
      nextTicket: drainingFrom([ticket(1)]),
      confirm: async () => (++confirms <= 2 ? ciRed : merged),
      rerunFailedChecks: async () => {
        seen.push("rerun");
        return true;
      },
      repair: async () => {
        seen.push("repair");
        return {
          status: "not-this-branch",
          reason: "the Bun e2e fails the same way on main",
        } as const;
      },
    });

    const report = await runShipLoop(p, allLanes);

    expect(seen).toEqual(["rerun", "repair", "rerun"]);
    expect(report.merged).toHaveLength(1);
    expect(parked).toEqual([]);
  });

  test("a failure that is not the branch's but comes back after its re-run parks with the fixer's reason", async () => {
    let repairs = 0;
    const { ports: p, parked } = ports({
      nextTicket: drainingFrom([ticket(1)]),
      confirm: async () => ciRed,
      repair: async () => {
        repairs += 1;
        return {
          status: "not-this-branch",
          reason: "the Bun e2e fails the same way on main",
        } as const;
      },
    });

    await runShipLoop(p, allLanes);

    expect(repairs).toBe(1);
    expect(parked[0]?.reason).toContain("fails the same way on main");
  });

  test("a repair that throws parks the ticket rather than losing the pull request", async () => {
    const { ports: p, parked } = ports({
      nextTicket: drainingFrom([ticket(1)]),
      confirm: async () => ciRed,
      repair: async () => {
        throw new Error("docker: no space left on device");
      },
    });

    await runShipLoop(p, allLanes);

    expect(parked).toHaveLength(1);
    expect(parked[0]?.reason).toContain("no space left");
  });

  test("a refusal only a person can answer parks at once, without a repair", async () => {
    let repairs = 0;
    const { ports: p, parked } = ports({
      nextTicket: drainingFrom([ticket(1)]),
      confirm: async () => ({
        status: "failed",
        reason: "nasyrov requested changes",
        failingChecks: [],
        needsAPerson: true,
      }),
      repair: async () => {
        repairs += 1;
        return { status: "repaired" } as const;
      },
    });

    await runShipLoop(p, allLanes);

    expect(repairs).toBe(0);
    expect(parked[0]?.reason).toContain("nasyrov requested changes");
  });

  test("a queued pull request is confirmed while its lane moves on, not after the whole drain", async () => {
    let confirmingTheFirst = false;
    let sawItWhileShippingTheSecond = false;
    const { ports: p } = ports({
      nextTicket: drainingFrom([ticket(1), ticket(2)]),
      confirm: async (pr) => {
        if (pr.number === 101) confirmingTheFirst = true;
        return merged;
      },
      ship: async (t) => {
        if (t.number === 2) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          sawItWhileShippingTheSecond = confirmingTheFirst;
        }
        return {
          status: "queued",
          pullRequest: { number: 100 + t.number, url: `pr/${t.number}` },
        };
      },
    });

    const report = await runShipLoop(p, { lanes: 1, withinBudget: () => true });

    expect(sawItWhileShippingTheSecond).toBe(true);
    expect(report.merged.map(({ ticket: t }) => t.number)).toEqual([1, 2]);
  });

  test("a ticket a merge unblocks is taken by a lane that had nothing to do", async () => {
    const shipped: number[] = [];
    let secondIsUnblocked = false;
    const { ports: p } = ports({
      nextTicket: (() => {
        let handedOutFirst = false;
        let handedOutSecond = false;
        return () => {
          if (!handedOutFirst) {
            handedOutFirst = true;
            return ticket(1);
          }
          if (secondIsUnblocked && !handedOutSecond) {
            handedOutSecond = true;
            return ticket(2);
          }
          return undefined;
        };
      })(),
      ship: async (t) => {
        shipped.push(t.number);
        return {
          status: "queued",
          pullRequest: { number: 100 + t.number, url: `pr/${t.number}` },
        };
      },
      confirm: async (pr) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (pr.number === 101) secondIsUnblocked = true;
        return merged;
      },
    });

    const report = await runShipLoop(p, allLanes);

    expect(shipped).toEqual([1, 2]);
    expect(report.merged.map(({ ticket: t }) => t.number)).toEqual([1, 2]);
  });

  test("a pull request's own failed check is re-run once before any repair", async () => {
    const seen: string[] = [];
    let confirms = 0;
    const { ports: p, parked } = ports({
      nextTicket: drainingFrom([ticket(1)]),
      confirm: async () => (++confirms === 1 ? ciRed : merged),
      rerunFailedChecks: async () => {
        seen.push("rerun");
        return true;
      },
      repair: async () => {
        seen.push("repair");
        return { status: "repaired" } as const;
      },
    });

    const report = await runShipLoop(p, allLanes);

    expect(seen).toEqual(["rerun"]);
    expect(report.merged).toHaveLength(1);
    expect(parked).toEqual([]);
  });

  test("a check that fails again after its re-run goes to repair", async () => {
    const seen: string[] = [];
    let confirms = 0;
    const { ports: p } = ports({
      nextTicket: drainingFrom([ticket(1)]),
      confirm: async () => (++confirms <= 2 ? ciRed : merged),
      rerunFailedChecks: async () => {
        seen.push("rerun");
        return true;
      },
      repair: async () => {
        seen.push("repair");
        return { status: "repaired" } as const;
      },
    });

    await runShipLoop(p, allLanes);

    expect(seen).toEqual(["rerun", "repair"]);
  });

  test.each([
    [
      "the merge group failed",
      { ...ciRed, fromTheMergeGroup: true } satisfies MergeOutcome,
    ],
    [
      "the branch conflicts",
      { ...ciRed, failingChecks: [], conflicted: true } satisfies MergeOutcome,
    ],
  ])("when %s, nothing is re-run", async (_, refusal) => {
    const seen: string[] = [];
    let confirms = 0;
    const { ports: p } = ports({
      nextTicket: drainingFrom([ticket(1)]),
      confirm: async () => (++confirms === 1 ? refusal : merged),
      rerunFailedChecks: async () => {
        seen.push("rerun");
        return true;
      },
      repair: async () => {
        seen.push("repair");
        return { status: "repaired" } as const;
      },
    });

    await runShipLoop(p, allLanes);

    expect(seen).toEqual(["repair"]);
  });

  test("a lane with nothing to take at the start waits for the lanes still shipping", async () => {
    let merged1 = false;
    const handedOut = new Set<number>();
    let shipping = 0;
    let busiest = 0;
    const { ports: p } = ports({
      nextTicket: () => {
        const takeable = merged1 ? [1, 2, 3] : [1];
        const next = takeable.find((n) => !handedOut.has(n));
        if (next === undefined) return undefined;
        handedOut.add(next);
        return ticket(next);
      },
      ship: async (t) => {
        shipping += 1;
        busiest = Math.max(busiest, shipping);
        await new Promise((resolve) => setTimeout(resolve, 5));
        shipping -= 1;
        return {
          status: "queued",
          pullRequest: { number: 100 + t.number, url: `pr/${t.number}` },
        };
      },
      confirm: async (pr) => {
        if (pr.number === 101) merged1 = true;
        return merged;
      },
    });

    const report = await runShipLoop(p, allLanes);

    expect(report.merged).toHaveLength(3);
    expect(busiest).toBe(2);
  });

  test("the run ending during a repair releases the ticket and keeps the pull request", async () => {
    const {
      ports: p,
      parked,
      released,
    } = ports({
      nextTicket: drainingFrom([ticket(1)]),
      confirm: async () => ciRed,
      rerunFailedChecks: async () => false,
      repair: async () => {
        throw new Error(
          "claude-code exited with code 1: You've hit your session limit · resets 5:30pm (UTC)",
        );
      },
    });

    const report = await runShipLoop(p, allLanes);

    expect(parked).toEqual([]);
    expect(released).toEqual([1]);
    expect(report.outage).toContain("session limit");
  });

  test("a repair takes one of the lanes' slots, so ships and repairs never exceed the lanes", async () => {
    let busy = 0;
    let busiest = 0;
    const occupy = async () => {
      busy += 1;
      busiest = Math.max(busiest, busy);
      await new Promise((resolve) => setTimeout(resolve, 5));
      busy -= 1;
    };
    let confirms = 0;
    const { ports: p } = ports({
      nextTicket: drainingFrom([ticket(1), ticket(2), ticket(3)]),
      ship: async (t) => {
        await occupy();
        return {
          status: "queued",
          pullRequest: { number: 100 + t.number, url: `pr/${t.number}` },
        };
      },
      confirm: async (pr) =>
        pr.number === 101 && ++confirms === 1 ? ciRed : merged,
      rerunFailedChecks: async () => false,
      repair: async () => {
        await occupy();
        return { status: "repaired" } as const;
      },
    });

    await runShipLoop(p, allLanes);

    expect(busiest).toBeLessThanOrEqual(2);
  });

  test("a pull request an earlier run left in flight is confirmed, and repaired, by this run", async () => {
    const repaired: number[] = [];
    let confirms = 0;
    const { ports: p } = ports({
      nextTicket: () => undefined,
      inFlightFromEarlierRuns: () => [
        {
          ticket: ticket(7),
          pullRequest: { number: 107, url: "pr/7" },
        },
      ],
      confirm: async () => (++confirms === 1 ? ciRed : merged),
      rerunFailedChecks: async () => false,
      repair: async (_ticket, pr) => {
        repaired.push(pr.number);
        return { status: "repaired" } as const;
      },
    });

    const report = await runShipLoop(p, allLanes);

    expect(repaired).toEqual([107]);
    expect(report.merged.map(({ ticket: t }) => t.number)).toEqual([7]);
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
