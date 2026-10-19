import type { SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import type { JsonValue } from "../json.js";
import type { LeaseResource } from "./edit-lease.js";
import { isJsonObject } from "../json.js";

/**
 * The token's `etag`: the table's `updated_at`, in seconds. Opaque to clients,
 * which send it back as `ifMatch` and never parse it.
 */
export function etagOf(updatedAt: Date): string {
  return String(Math.floor(updatedAt.getTime() / 1000));
}

/** `undefined` for anything `etagOf` could not have produced. */
export function parseIfMatch(value: string): Date | undefined {
  if (!/^\d{1,12}$/.test(value)) return undefined;
  return new Date(Number(value) * 1000);
}

/** `undefined` for anything a version counter's `etag` could not be. */
function parseVersionIfMatch(value: string): number | undefined {
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
 * A guarded write refused because its copy is out of date: the resource's
 * current `updated_at`, or its version counter, which records no change time.
 * Given the `resource`, the RPC conflict also names who holds its edit lease.
 */
export class ConflictError extends Error {
  readonly etag: string;
  readonly updatedAt: Date | undefined;
  readonly resource: LeaseResource | undefined;

  constructor(token: Date | number, resource?: LeaseResource) {
    super("The resource changed since this copy was read.");
    this.name = "ConflictError";
    this.etag = typeof token === "number" ? String(token) : etagOf(token);
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
