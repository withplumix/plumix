import type { NewAuditLogRow } from "../db/schema.js";
import type { AuditLogActor } from "../types.js";

/**
 * Pure helper that turns an event payload into a denormalized audit
 * row. The `properties` envelope is intentionally narrow for v1 —
 * `{ diff: { field: [old, new] } }` for entity mutations; future
 * events can add their own keys without breaking older readers
 * because the column is JSON.
 *
 * Diff shape rules:
 * - Only top-level entity columns are diffed. Nested JSON (meta,
 *   content) is intentionally skipped — those have their own
 *   dedicated events (`entry:meta_changed`).
 * - A field appears in the diff iff `previous[k] !== next[k]`. Missing
 *   keys on either side are treated as `null`.
 * - Date instances compare via `.getTime()`; everything else uses
 *   structural equality through `JSON.stringify` so `[1,2]` and
 *   `[1,2]` count as equal.
 */
interface BuildAuditRowInput {
  readonly event: string;
  readonly actor: AuditLogActor;
  readonly subject: {
    readonly type: string;
    readonly id: string;
    readonly label: string;
  };
  readonly previous?: Readonly<Record<string, unknown>>;
  readonly next?: Readonly<Record<string, unknown>>;
  /** Extra fields merged into `properties` after the diff. */
  readonly extraProperties?: Readonly<Record<string, unknown>>;
}

export function buildAuditRow(input: BuildAuditRowInput): NewAuditLogRow {
  const properties: Record<string, unknown> = { ...input.extraProperties };
  const diff = computeDiff(input.previous, input.next);
  if (diff !== null) properties.diff = diff;
  return {
    event: input.event,
    subjectType: input.subject.type,
    subjectId: input.subject.id,
    subjectLabel: input.subject.label,
    actorId: input.actor.id,
    actorLabel: input.actor.label,
    properties,
  };
}

function computeDiff(
  previous: Readonly<Record<string, unknown>> | undefined,
  next: Readonly<Record<string, unknown>> | undefined,
): Record<string, [unknown, unknown]> | null {
  if (previous === undefined || next === undefined) return null;
  const out: Record<string, [unknown, unknown]> = {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    const oldValue = previous[key] ?? null;
    const newValue = next[key] ?? null;
    if (!shallowEqual(oldValue, newValue)) {
      out[key] = [oldValue, newValue];
    }
  }
  return Object.keys(out).length === 0 ? null : out;
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date)
    return a.getTime() === b.getTime();
  // Structural fallback for arrays / plain objects. Cheap enough for
  // top-level columns; expensive for nested content (which we don't
  // diff anyway).
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
