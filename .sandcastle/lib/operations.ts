import type { ShipEvent, ShipHistory } from "./ship-history.js";

export const issueOf = (event: ShipEvent): number | undefined =>
  "issue" in event
    ? event.issue
    : "ticket" in event
      ? event.ticket.number
      : undefined;

export function measureHistory(history: ShipHistory) {
  const events = history.events.map(({ event }) => event);
  const phases = events.flatMap((event) =>
    event.type === "phase.finished" ? [event.phase] : [],
  );
  const agents = phases.filter(({ kind }) => kind === "agent");
  const count = (type: ShipEvent["type"]) =>
    events.filter((event) => event.type === type).length;
  const mergedIssues = new Set(
    events.filter((event) => event.type === "delivery.merged").map(issueOf),
  );
  const repairedIssues = new Set(
    events.filter((event) => event.type === "repair.started").map(issueOf),
  );
  return {
    runs: count("ship.started"),
    merged: count("delivery.merged"),
    parked: count("delivery.parked"),
    pending: history.pending().length,
    repairs: count("repair.started"),
    rebases: count("rebase.started"),
    firstPassMerged: [...mergedIssues].filter(
      (issue) => !repairedIssues.has(issue),
    ).length,
    agentCalls: agents.length,
    agentFailures: agents.filter(
      ({ outcome }) => outcome === "error" || outcome === "fail",
    ).length,
    agentMs: agents.reduce((sum, phase) => sum + phase.durationMs, 0),
    cooldownWaitMs: agents.reduce(
      (sum, phase) => sum + (phase.waitedMs ?? 0),
      0,
    ),
    gateMs: phases
      .filter(({ kind }) => kind === "gate")
      .reduce((sum, phase) => sum + phase.durationMs, 0),
    gateFailures: phases.filter(
      ({ kind, outcome }) =>
        kind === "gate" && (outcome === "fail" || outcome === "error"),
    ).length,
    reviewPasses: phases.filter(({ kind }) => kind === "review").length,
    knownNotionalCostUsd: agents.reduce(
      (sum, phase) => sum + (phase.notionalCostUsd ?? 0),
      0,
    ),
    unmeasuredAgentPhases: agents.filter(
      (phase) =>
        phase.notionalCostUsd === undefined || phase.usageComplete === false,
    ).length,
  };
}

export function statusText(history: ShipHistory): string {
  const lines = history
    .pending()
    .map(({ ticket, pullRequest, branch, repairs, rebases }) => {
      const observed = pullRequest
        ? history.observation(pullRequest.number)
        : undefined;
      return `#${ticket.number} ${pullRequest?.url ?? branch ?? "interrupted"}: ${observed?.reason ?? "awaiting recovery"}; repairs ${repairs}, rebases ${rebases}${observed ? `; next ${new Date(observed.nextCheckAt).toISOString()}` : ""}`;
    });
  if (history.cooldownUntil > Date.now())
    lines.push(
      `Account cooldown until ${new Date(history.cooldownUntil).toISOString()}`,
    );
  lines.push(
    ...history.incompleteFiles.map(
      (file) => `Incomplete journal tail: ${file}`,
    ),
  );
  return lines.join("\n") || "No unfinished deliveries in local journals.";
}

export function reportText(history: ShipHistory): string {
  const report = measureHistory(history);
  const stages = new Map<string, { calls: number; ms: number; cost: number }>();
  for (const { event } of history.events) {
    if (event.type !== "phase.finished") continue;
    const key = `${event.phase.phase.replace(/[#:].*$/, "")} / ${event.phase.model ?? event.phase.kind}`;
    const previous = stages.get(key) ?? { calls: 0, ms: 0, cost: 0 };
    stages.set(key, {
      calls: previous.calls + 1,
      ms: previous.ms + event.phase.durationMs,
      cost: previous.cost + (event.phase.notionalCostUsd ?? 0),
    });
  }
  return [
    JSON.stringify(report, null, 2),
    "",
    "Phase / model: calls, active seconds, known API-equivalent USD",
    ...[...stages].map(
      ([name, stats]) =>
        `${name}: ${stats.calls}, ${(stats.ms / 1000).toFixed(1)}s, $${stats.cost.toFixed(3)}`,
    ),
    "",
    "API-equivalent estimates compare work; they are not subscription charges. Missing or interrupted usage remains unmeasured. Phase time sums parallel work, not elapsed run time.",
  ].join("\n");
}

export function explainText(history: ShipHistory, issue: number): string {
  return (
    history.events
      .filter(({ event }) => issueOf(event) === issue)
      .map(
        ({ event, at, file, line }) =>
          `${at} ${JSON.stringify(event)}\n  ${file}:${line}`,
      )
      .join("\n") || `No recorded history for #${issue}.`
  );
}
