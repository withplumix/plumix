import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { prepareDelivery } from "./delivery.js";
import { ShipHistory } from "./ship-history.js";

const roots: string[] = [];
afterEach(() =>
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true })),
);

describe("prepareDelivery", () => {
  test("a new attempt cannot be mistaken for an earlier PR on a reused branch", async () => {
    const root = mkdtempSync(join(tmpdir(), "ship-delivery-"));
    roots.push(root);
    const history = new ShipHistory(root);
    const ticket = { number: 1, title: "fix saving" };
    const environment = {
      assign: () => {},
      reset: () => {},
      open: async () => "sandbox",
      sessionExists: () => false,
      carriesWork: () => true,
    };
    const first = await prepareDelivery(ticket, history, environment);
    history.record({ type: "delivery.merged", issue: 1 });
    const second = await prepareDelivery(ticket, history, environment);
    expect(first.branch).not.toBe(second.branch);
  });
  const parkedOnce = (carriesWork: boolean) => {
    const root = mkdtempSync(join(tmpdir(), "ship-delivery-"));
    roots.push(root);
    const prior = new ShipHistory(root);
    const ticket = { number: 1, title: "fix saving" };
    prior.record({
      type: "delivery.started",
      ticket,
      branch: "feat/fix-saving-1",
    });
    prior.record({ type: "delivery.parked", issue: 1, reason: "a comment" });
    const resets: string[] = [];
    return {
      ticket,
      history: new ShipHistory(root),
      resets,
      environment: {
        assign: () => {},
        reset: (branch: string) => void resets.push(branch),
        open: async () => "sandbox",
        sessionExists: () => false,
        carriesWork: () => carriesWork,
      },
    };
  };

  test("a retake after a park continues on the parked branch's work instead of implementing it again", async () => {
    const { ticket, history, resets, environment } = parkedOnce(true);

    const prepared = await prepareDelivery(ticket, history, environment);

    expect(prepared).toMatchObject({
      branch: "feat/fix-saving-1",
      resumed: true,
    });
    expect(resets).toEqual([]);
    expect(history.pending().map(({ branch }) => branch)).toEqual([
      "feat/fix-saving-1",
    ]);
  });

  test("a parked branch that carries no work is not worth continuing", async () => {
    const { ticket, history, resets, environment } = parkedOnce(false);

    const prepared = await prepareDelivery(ticket, history, environment);

    expect(prepared.branch).not.toBe("feat/fix-saving-1");
    expect(prepared.resumed).toBe(false);
    expect(resets).toEqual([prepared.branch]);
  });

  test("a captured owner session is resumed when its transcript still exists", async () => {
    const root = mkdtempSync(join(tmpdir(), "ship-delivery-"));
    roots.push(root);
    const ticket = { number: 1, title: "fix saving" };
    const prior = new ShipHistory(root);
    prior.record({
      type: "delivery.started",
      ticket,
      branch: "feat/fix-saving-1",
    });
    prior.record({
      type: "phase.finished",
      issue: 1,
      journalRunId: "previous",
      phase: {
        phase: "implement",
        kind: "agent",
        startedAt: "2026-11-11T00:00:00Z",
        durationMs: 5,
        outcome: "ok",
        sessionId: "owner-session",
        sessionFile: "/sessions/owner.jsonl",
      },
    });

    const prepared = await prepareDelivery(ticket, new ShipHistory(root), {
      assign: () => {},
      reset: () => {
        throw new Error("must preserve work");
      },
      open: async () => "sandbox",
      sessionExists: (path) => path === "/sessions/owner.jsonl",
      carriesWork: () => false,
    });

    expect(prepared.sessionId).toBe("owner-session");
  });

  test("interrupted work reopens its existing branch without resetting it", async () => {
    const root = mkdtempSync(join(tmpdir(), "ship-delivery-"));
    roots.push(root);
    const prior = new ShipHistory(root);
    const ticket = { number: 1, title: "fix saving" };
    prior.record({
      type: "delivery.started",
      ticket,
      branch: "feat/fix-saving-1",
    });
    const journal = new ShipHistory(root);
    const resets: string[] = [];
    const opened: { branch: string; resumed: boolean }[] = [];

    const prepared = await prepareDelivery(ticket, journal, {
      assign: () => {},
      reset: (branch) => void resets.push(branch),
      open: async (branch, resumed) => {
        opened.push({ branch, resumed });
        return "sandbox";
      },
      sessionExists: () => false,
      carriesWork: () => false,
    });

    expect(resets).toEqual([]);
    expect(opened).toEqual([{ branch: "feat/fix-saving-1", resumed: true }]);
    expect(prepared).toMatchObject({
      branch: "feat/fix-saving-1",
      resumed: true,
      sandbox: "sandbox",
    });
  });
});
