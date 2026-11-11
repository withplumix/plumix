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
