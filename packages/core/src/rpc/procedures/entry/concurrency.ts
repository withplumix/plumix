import type {
  AuthenticatedAppContext,
  Db,
} from "../../../context/app-context.js";
import type { EditLeaseSurface } from "../../../db/schema/edit_leases.js";
import type { Entry, NewEntry } from "../../../db/schema/entries.js";
import { claim, ConflictError, nextToken } from "../../../db/concurrency.js";
import { assertWritable } from "../../../db/edit-lease.js";
import { and, eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";

export const ENTRY_IF_MATCH_MESSAGE =
  "Send the entry's `etag` from `entry.get` as `ifMatch`";

/** A session is the admin's; an API token is a client calling RPC itself. */
export function rpcSurface(context: AuthenticatedAppContext): EditLeaseSurface {
  return context.tokenScopes === null ? "admin" : "rpc";
}

/** Refuses a write from a copy while another user holds the entry's lease. */
export function assertEntryWritable(
  context: AuthenticatedAppContext,
  id: number,
  takeOver: boolean | undefined,
): Promise<void> {
  return assertWritable(
    context.db,
    { kind: "entry", id },
    { userId: context.user.id, surface: rpcSurface(context) },
    { takeOver },
  );
}

/** Refuses a write whose copy the row has moved past since. */
export function assertCopyCurrent(
  ifMatch: Date,
  row: Pick<Entry, "id" | "updatedAt">,
): void {
  if (ifMatch.getTime() !== row.updatedAt.getTime()) {
    throw new ConflictError(row.updatedAt, { kind: "entry", id: row.id });
  }
}

/**
 * One conditional update: it lands only while the row still holds `ifMatch`,
 * and moves the token. Throws `ConflictError` when another write landed first;
 * `undefined` when the entry is gone.
 */
export async function claimEntry(
  db: Db,
  id: number,
  ifMatch: Date,
  changes: Partial<NewEntry>,
): Promise<Entry | undefined> {
  const guard = claim(entries.updatedAt, ifMatch);
  const [row] = await db
    .update(entries)
    .set({ ...changes, ...guard.set })
    .where(and(eq(entries.id, id), guard.where))
    .returning();
  if (row) return row;
  const [current] = await db
    .select({ updatedAt: entries.updatedAt })
    .from(entries)
    .where(eq(entries.id, id));
  if (current) {
    throw new ConflictError(current.updatedAt, { kind: "entry", id });
  }
  return undefined;
}

/**
 * A system write: lands only while the row holds the token `decide` read, else
 * re-reads and decides again. `undefined` once the entry is gone.
 */
export async function writeAsSystem(
  db: Db,
  read: Entry,
  decide: (row: Entry) => Partial<NewEntry> | undefined,
): Promise<{ readonly row: Entry; readonly written: boolean } | undefined> {
  let row: Entry | undefined = read;
  while (row) {
    const changes = decide(row);
    if (changes === undefined) return { row, written: false };
    const [updated] = await db
      .update(entries)
      .set({ ...changes, updatedAt: nextToken(row.updatedAt, new Date()) })
      .where(and(eq(entries.id, row.id), eq(entries.updatedAt, row.updatedAt)))
      .returning();
    if (updated) return { row: updated, written: true };
    row = await db.query.entries.findFirst({ where: eq(entries.id, row.id) });
  }
  return undefined;
}
