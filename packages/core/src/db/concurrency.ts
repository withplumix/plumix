import type { SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import type { JsonValue } from "../json.js";
import type { LeaseResource } from "./edit-lease.js";
import { isJsonObject } from "../json.js";

/**
 * The token's `etag`: the table's `updated_at` in seconds, or its `version`.
 * Opaque to clients, which send it back as `ifMatch` and never parse it.
 */
export function etagOf(token: Date | number): string {
  return typeof token === "number"
    ? String(token)
    : String(Math.floor(token.getTime() / 1000));
}

/** `undefined` for anything `etagOf` could not have produced. */
export function parseIfMatch(value: string): Date | undefined {
  if (!/^\d{1,12}$/.test(value)) return undefined;
  return new Date(Number(value) * 1000);
}

/** `undefined` for anything a version counter's `etag` could not be. */
export function parseVersionIfMatch(value: string): number | undefined {
  if (!/^\d{1,12}$/.test(value)) return undefined;
  return Number(value);
}

/**
 * Strictly past `ifMatch` at any write rate, so two writes in one second
 * still leave different tokens.
 */
export function nextToken(ifMatch: Date, now: Date): Date {
  const seconds = Math.max(
    Math.floor(now.getTime() / 1000),
    Math.floor(ifMatch.getTime() / 1000) + 1,
  );
  return new Date(seconds * 1000);
}

/**
 * The halves a guarded write adds to its update: `where` holds only while the
 * row still has `ifMatch`, `set` moves the token. No row back means stale.
 */
export function claim(
  updatedAt: SQLiteColumn,
  ifMatch: Date,
  now: Date = new Date(),
): { readonly where: SQL; readonly set: { readonly updatedAt: Date } } {
  return {
    where: eq(updatedAt, ifMatch),
    set: { updatedAt: nextToken(ifMatch, now) },
  };
}

/** How the guarded writes reach one resource's table, typed, with no casts. */
export interface GuardedTableSpec<
  Row extends { readonly id: number; readonly updatedAt: Date },
  Changes,
> {
  /** The edit lease kind a conflict names. */
  readonly kind: string;
  readonly updatedAt: SQLiteColumn;
  /** The row by `id` where `where` also holds; `undefined` when none did. */
  readonly update: (
    id: number,
    set: Changes & { readonly updatedAt: Date },
    where: SQL,
  ) => Promise<Row | undefined>;
  readonly read: (id: number) => Promise<Row | undefined>;
}

export interface GuardedTable<
  Row extends { readonly id: number; readonly updatedAt: Date },
  Changes,
> {
  readonly kind: string;
  readonly read: (id: number) => Promise<Row | undefined>;
  /** Refuses a write whose copy the row has moved past since. */
  readonly assertCopyCurrent: (
    ifMatch: Date,
    row: { readonly id: number; readonly updatedAt: Date },
  ) => void;
  /**
   * One update that lands only while the row holds `ifMatch` (and `where`),
   * moving the token. `ConflictError` once another write landed; `undefined`
   * when the row is gone or `where` refused it.
   */
  readonly claimRow: (
    id: number,
    ifMatch: Date,
    changes: Changes,
    where?: SQL,
  ) => Promise<Row | undefined>;
  /**
   * A system write: lands only while the row holds the token `decide` read,
   * else re-reads and decides again. `undefined` once the row is gone.
   */
  readonly writeAsSystem: (
    read: Row | undefined,
    decide: (row: Row) => Changes | undefined,
  ) => Promise<{ readonly row: Row; readonly written: boolean } | undefined>;
}

export function guardedTable<
  Row extends { readonly id: number; readonly updatedAt: Date },
  Changes,
>(spec: GuardedTableSpec<Row, Changes>): GuardedTable<Row, Changes> {
  const assertCopyCurrent: GuardedTable<Row, Changes>["assertCopyCurrent"] = (
    ifMatch,
    row,
  ) => {
    if (ifMatch.getTime() !== row.updatedAt.getTime()) {
      throw new ConflictError(row.updatedAt, { kind: spec.kind, id: row.id });
    }
  };
  return {
    kind: spec.kind,
    read: spec.read,
    assertCopyCurrent,
    claimRow: async (id, ifMatch, changes, where) => {
      const guard = claim(spec.updatedAt, ifMatch);
      const row = await spec.update(
        id,
        { ...changes, ...guard.set },
        (where && and(guard.where, where)) ?? guard.where,
      );
      if (row) return row;
      const current = await spec.read(id);
      if (current) assertCopyCurrent(ifMatch, current);
      return undefined;
    },
    writeAsSystem: async (read, decide) => {
      let row = read;
      while (row) {
        const changes = decide(row);
        if (changes === undefined) return { row, written: false };
        const guard = claim(spec.updatedAt, row.updatedAt);
        const updated = await spec.update(
          row.id,
          { ...changes, ...guard.set },
          guard.where,
        );
        if (updated) return { row: updated, written: true };
        row = await spec.read(row.id);
      }
      return undefined;
    },
  };
}

/** `claim` for a table whose token is its `version`: it moves by one. */
export function claimVersion(
  version: SQLiteColumn,
  ifMatch: number,
): { readonly where: SQL; readonly set: { readonly version: number } } {
  return { where: eq(version, ifMatch), set: { version: ifMatch + 1 } };
}

/** RFC 7386: `null` removes a key, an object merges, anything else replaces. */
export function mergePatch(target: JsonValue, patch: JsonValue): JsonValue {
  if (!isJsonObject(patch)) return patch;
  const merged: Record<string, JsonValue> = isJsonObject(target)
    ? { ...target }
    : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key];
    else merged[key] = mergePatch(merged[key] ?? null, value);
  }
  return merged;
}

/**
 * A guarded write refused because its copy is out of date. A version counter
 * records no change time. Given the `resource`, the conflict names the lease
 * holder.
 */
export class ConflictError extends Error {
  readonly etag: string;
  readonly updatedAt: Date | undefined;
  readonly resource: LeaseResource | undefined;

  constructor(token: Date | number, resource?: LeaseResource) {
    super("The resource changed since this copy was read.");
    this.name = "ConflictError";
    this.etag = etagOf(token);
    this.updatedAt = typeof token === "number" ? undefined : token;
    this.resource = resource;
  }

  get data(): {
    readonly reason: "etag_mismatch";
    readonly etag: string;
    readonly updatedAt?: Date;
  } {
    return {
      reason: "etag_mismatch",
      etag: this.etag,
      ...(this.updatedAt === undefined ? {} : { updatedAt: this.updatedAt }),
    };
  }
}

type IfMatchSchema<T> = v.SchemaWithPipe<
  readonly [v.StringSchema<string>, v.RawTransformAction<string, T>]
>;
type ObjectMessage = v.ErrorMessage<v.ObjectIssue>;

function ifMatchWith<const E extends v.ObjectEntries, T>(
  entries: E,
  message: string,
  parse: (value: string) => T | undefined,
): v.ObjectSchema<E & { readonly ifMatch: IfMatchSchema<T> }, ObjectMessage> {
  return v.object(
    {
      ...entries,
      ifMatch: v.pipe(
        v.string(message),
        v.rawTransform(({ dataset, addIssue, NEVER }) => {
          const token = parse(dataset.value);
          if (token !== undefined) return token;
          addIssue({ message });
          return NEVER;
        }),
      ),
    },
    // valibot reports a missing key with the object's message.
    (issue) => (issue.expected === '"ifMatch"' ? message : issue.message),
  );
}

/**
 * `entries` plus a required `ifMatch`, parsed to the token. `message` tells a
 * caller who left it out, or malformed it, where the `etag` comes from.
 */
export function ifMatchObject<const E extends v.ObjectEntries>(
  entries: E,
  message: string,
): v.ObjectSchema<
  E & { readonly ifMatch: IfMatchSchema<Date> },
  ObjectMessage
> {
  return ifMatchWith(entries, message, parseIfMatch);
}

/** `ifMatchObject` for a resource whose token is a version counter. */
export function versionIfMatchObject<const E extends v.ObjectEntries>(
  entries: E,
  message: string,
): v.ObjectSchema<
  E & { readonly ifMatch: IfMatchSchema<number> },
  ObjectMessage
> {
  return ifMatchWith(entries, message, parseVersionIfMatch);
}
