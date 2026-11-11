import { appendFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

import type { QueuedPullRequest, Ticket } from "./github.js";
import type { PhaseRecord } from "./telemetry.js";

export interface PendingDelivery {
  readonly ticket: Ticket;
  readonly pullRequest?: QueuedPullRequest;
  readonly branch?: string;
  readonly repairs: number;
  readonly rebases: number;
}

export interface PrObservation {
  readonly issue: number;
  readonly pullRequest: number;
  readonly headSha: string;
  readonly verdict: string;
  readonly reason: string;
  readonly nextCheckAt: number;
  readonly missingChecks: number;
  readonly queueDrops: number;
}

export type ShipEvent =
  | {
      readonly type: "analysis.completed";
      readonly issue: number;
      readonly brief: string;
    }
  | {
      readonly type: "account.cooldown";
      readonly until: number;
      readonly reason: string;
    }
  | {
      readonly type: "head.reviewed";
      readonly issue: number;
      readonly headSha: string;
    }
  | {
      readonly type: "checks.rerun-requested";
      readonly issue: number;
      readonly headSha: string;
    }
  | ({ readonly type: "pr.observed" } & PrObservation)
  | { readonly type: "ship.started" | "ship.finished" }
  | {
      readonly type: "phase.finished";
      readonly issue: number;
      readonly journalRunId: string;
      readonly phase: PhaseRecord;
    }
  | {
      readonly type: "delivery.started";
      readonly ticket: Ticket;
      readonly branch: string;
    }
  | {
      readonly type: "pr.tracked";
      readonly ticket: Ticket;
      readonly pullRequest: QueuedPullRequest;
    }
  | {
      readonly type: "repair.started" | "rebase.started";
      readonly issue: number;
    }
  | {
      readonly type: "delivery.merged" | "delivery.parked";
      readonly issue: number;
      readonly reason?: string;
    };

const issueNumber = z.number().int().positive();
const ticketSchema = z.object({ number: issueNumber, title: z.string() });
const shipEventSchema: z.ZodType<ShipEvent> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("analysis.completed"),
    issue: issueNumber,
    brief: z.string(),
  }),
  z.object({
    type: z.literal("account.cooldown"),
    until: z.number(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("head.reviewed"),
    issue: issueNumber,
    headSha: z.string(),
  }),
  z.object({
    type: z.literal("checks.rerun-requested"),
    issue: issueNumber,
    headSha: z.string(),
  }),
  z.object({
    type: z.literal("pr.observed"),
    issue: issueNumber,
    pullRequest: issueNumber,
    headSha: z.string(),
    verdict: z.string(),
    reason: z.string(),
    nextCheckAt: z.number(),
    missingChecks: z.number().int().nonnegative(),
    queueDrops: z.number().int().nonnegative(),
  }),
  z.object({ type: z.enum(["ship.started", "ship.finished"]) }),
  z.object({
    type: z.literal("delivery.started"),
    ticket: ticketSchema,
    branch: z.string(),
  }),
  z.object({
    type: z.literal("pr.tracked"),
    ticket: ticketSchema,
    pullRequest: z.object({ number: issueNumber, url: z.string() }),
  }),
  z.object({
    type: z.enum(["repair.started", "rebase.started"]),
    issue: issueNumber,
  }),
  z.object({
    type: z.enum(["delivery.merged", "delivery.parked"]),
    issue: issueNumber,
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal("phase.finished"),
    issue: issueNumber,
    journalRunId: z.string(),
    phase: z
      .object({
        phase: z.string(),
        kind: z.enum(["agent", "gate", "review"]),
        startedAt: z.string(),
        durationMs: z.number(),
        outcome: z.enum(["ok", "fail", "error", "skipped"]),
      })
      .passthrough(),
  }),
]);

export class ShipHistory {
  cooldownUntil = 0;
  readonly path: string;
  readonly incompleteFiles: string[] = [];
  readonly #deliveries = new Map<number, PendingDelivery>();
  readonly #observations = new Map<number, PrObservation>();
  readonly #reruns = new Set<string>();
  readonly #reviewedHeads = new Map<number, string>();
  readonly #ownerSessions = new Map<number, { id: string; path: string }>();

  constructor(root: string) {
    const runs = join(root, "runs");
    mkdirSync(runs, { recursive: true });
    let timestamp = Date.now();
    for (const name of readdirSync(runs)
      .filter((name) => /^ship-\d+$/.test(name))
      .sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))) {
      timestamp = Math.max(timestamp, Number(name.slice(5)) + 1);
      const path = join(runs, name, "events.jsonl");
      let text: string;
      try {
        text = readFileSync(path, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        this.incompleteFiles.push(path);
        continue;
      }
      const lines = text.split("\n");
      const tail = lines.pop();
      if (tail) this.incompleteFiles.push(path);
      for (const [index, line] of lines.entries()) {
        try {
          this.#apply(shipEventSchema.parse(JSON.parse(line)));
        } catch (cause) {
          throw new Error(`Cannot recover ${path}:${index + 1}`, { cause });
        }
      }
    }
    const runId = `ship-${timestamp}`;
    const directory = join(runs, runId);
    mkdirSync(directory);
    this.path = join(directory, "events.jsonl");
    appendFileSync(this.path, "");
    this.record({ type: "ship.started" });
  }

  record(event: ShipEvent): void {
    appendFileSync(
      this.path,
      `${JSON.stringify({ ...event, at: new Date().toISOString() })}\n`,
    );
    this.#apply(event);
  }

  pending(): readonly PendingDelivery[] {
    return [...this.#deliveries.values()];
  }

  observation(pullRequest: number): PrObservation | undefined {
    return this.#observations.get(pullRequest);
  }

  rerunRequested(issue: number, headSha: string): boolean {
    return this.#reruns.has(`${issue}:${headSha}`);
  }

  reviewedHead(issue: number): string | undefined {
    return this.#reviewedHeads.get(issue);
  }

  ownerSession(
    issue: number,
  ): { readonly id: string; readonly path: string } | undefined {
    return this.#ownerSessions.get(issue);
  }

  #apply(event: ShipEvent): void {
    if (event.type === "analysis.completed") {
      this.#reviewedHeads.delete(event.issue);
      return;
    }
    if (event.type === "account.cooldown") {
      this.cooldownUntil = Math.max(this.cooldownUntil, event.until);
      return;
    }
    if (event.type === "head.reviewed") {
      this.#reviewedHeads.set(event.issue, event.headSha);
      return;
    }
    if (
      event.type === "phase.finished" &&
      event.phase.kind === "agent" &&
      /^(implement|fix#|resolve-conflicts|repair:ci)/.test(event.phase.phase)
    ) {
      if (event.phase.sessionId && event.phase.sessionFile) {
        this.#ownerSessions.set(event.issue, {
          id: event.phase.sessionId,
          path: event.phase.sessionFile,
        });
      }
    }
    if (event.type === "checks.rerun-requested") {
      this.#reruns.add(`${event.issue}:${event.headSha}`);
      return;
    }
    if (event.type === "pr.observed") {
      this.#observations.set(event.pullRequest, event);
      return;
    }
    if (
      event.type === "ship.started" ||
      event.type === "ship.finished" ||
      event.type === "phase.finished"
    )
      return;
    if (event.type === "delivery.started") {
      this.#reviewedHeads.delete(event.ticket.number);
      this.#ownerSessions.delete(event.ticket.number);
      this.#deliveries.set(event.ticket.number, {
        ticket: event.ticket,
        branch: event.branch,
        repairs: 0,
        rebases: 0,
      });
      return;
    }
    if (event.type === "delivery.merged" || event.type === "delivery.parked") {
      this.#deliveries.delete(event.issue);
      return;
    }
    if (event.type === "pr.tracked") {
      const previous = this.#deliveries.get(event.ticket.number);
      const samePullRequest =
        previous?.pullRequest?.number === event.pullRequest.number;
      this.#deliveries.set(event.ticket.number, {
        ticket: event.ticket,
        pullRequest: event.pullRequest,
        repairs: samePullRequest ? previous.repairs : 0,
        rebases: samePullRequest ? previous.rebases : 0,
      });
      return;
    }
    if (event.type === "repair.started" || event.type === "rebase.started") {
      const previous = this.#deliveries.get(event.issue);
      if (!previous) throw new Error(`No tracked delivery for #${event.issue}`);
      this.#deliveries.set(event.issue, {
        ...previous,
        repairs: previous.repairs + (event.type === "repair.started" ? 1 : 0),
        rebases: previous.rebases + (event.type === "rebase.started" ? 1 : 0),
      });
      return;
    }
    throw new Error("Unknown ship event");
  }
}
