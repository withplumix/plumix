import type { SQL } from "drizzle-orm";

import type { Db } from "../context/app-context.js";
import type { EditLeaseSurface } from "./schema/edit_leases.js";
import {
  EDIT_LEASE_DURATION_MS,
  EDIT_LEASE_RENEW_INTERVAL_MS,
} from "./contract/edit-lease.js";
import { and, eq, gt, not, or } from "./index.js";
import { editLeases } from "./schema/edit_leases.js";
import { users } from "./schema/users.js";

export { EDIT_LEASE_DURATION_MS } from "./contract/edit-lease.js";

/** What can be leased: a kind of resource (`entry`) and its id. */
export interface LeaseResource {
  readonly kind: string;
  readonly id: string | number;
}

/** Who asks for a lease, and through which surface. */
export interface LeaseClaimant {
  readonly userId: number;
  readonly surface: EditLeaseSurface;
}

export interface LeaseHolder {
  readonly id: number;
  readonly name: string;
}

export interface EditLease {
  readonly holder: LeaseHolder;
  readonly surface: EditLeaseSurface;
  readonly since: Date;
  readonly expiresAt: Date;
}

function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + EDIT_LEASE_DURATION_MS);
}

function isLive(now: Date) {
  return gt(editLeases.expiresAt, now);
}

function isResource(resource: LeaseResource) {
  return and(
    eq(editLeases.resourceKind, resource.kind),
    eq(editLeases.resourceId, String(resource.id)),
  );
}

/** The live lease on `resource`, if anyone holds one at `now`. */
export async function readEditLease(
  db: Db,
  resource: LeaseResource,
  now: Date = new Date(),
): Promise<EditLease | undefined> {
  const [row] = await db
    .select({
      userId: editLeases.userId,
      name: users.name,
      email: users.email,
      surface: editLeases.surface,
      since: editLeases.since,
      expiresAt: editLeases.expiresAt,
    })
    .from(editLeases)
    .innerJoin(users, eq(users.id, editLeases.userId))
    .where(and(isResource(resource), isLive(now)));
  if (!row) return undefined;
  return {
    holder: { id: row.userId, name: row.name ?? row.email },
    surface: row.surface,
    since: row.since,
    expiresAt: row.expiresAt,
  };
}

/**
 * A write refused because another user holds a live edit lease on what it
 * writes.
 */
export class LockedError extends Error {
  readonly holder: LeaseHolder;
  readonly since: Date;

  constructor(lease: { readonly holder: LeaseHolder; readonly since: Date }) {
    super(`${lease.holder.name} is editing this resource.`);
    this.name = "LockedError";
    this.holder = lease.holder;
    this.since = lease.since;
  }

  get data(): { readonly holder: LeaseHolder; readonly since: Date } {
    return { holder: this.holder, since: this.since };
  }
}

/** The row's holder, whether or not their lease is still live. */
async function lastHolder(
  db: Db,
  resource: LeaseResource,
): Promise<{ readonly holder: LeaseHolder; readonly since: Date } | undefined> {
  const [row] = await db
    .select({
      userId: editLeases.userId,
      name: users.name,
      email: users.email,
      since: editLeases.since,
    })
    .from(editLeases)
    .innerJoin(users, eq(users.id, editLeases.userId))
    .where(isResource(resource));
  if (!row) return undefined;
  return {
    holder: { id: row.userId, name: row.name ?? row.email },
    since: row.since,
  };
}

async function holderNamed(db: Db, userId: number): Promise<LeaseHolder> {
  const [user] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  return { id: userId, name: user?.name ?? user?.email ?? String(userId) };
}

/** The upsert every claim is: no row back means `setWhere` refused it. */
async function upsertLease(
  db: Db,
  resource: LeaseResource,
  claimant: LeaseClaimant,
  now: Date,
  conflict: {
    readonly set: Partial<typeof editLeases.$inferInsert>;
    readonly setWhere?: SQL;
  },
): Promise<EditLease | undefined> {
  const [row] = await db
    .insert(editLeases)
    .values({
      resourceKind: resource.kind,
      resourceId: String(resource.id),
      userId: claimant.userId,
      surface: claimant.surface,
      since: now,
      expiresAt: expiryFrom(now),
    })
    .onConflictDoUpdate({
      target: [editLeases.resourceKind, editLeases.resourceId],
      ...conflict,
    })
    .returning({
      surface: editLeases.surface,
      since: editLeases.since,
      expiresAt: editLeases.expiresAt,
    });
  if (!row) return undefined;
  return { holder: await holderNamed(db, claimant.userId), ...row };
}

function startedBy(claimant: LeaseClaimant, now: Date) {
  return {
    userId: claimant.userId,
    surface: claimant.surface,
    since: now,
    expiresAt: expiryFrom(now),
  };
}

/**
 * Leases `resource` to the claimant over no lease, a lapsed one or their own,
 * which their other tabs share. Throws `LockedError` while another user holds
 * it.
 */
export async function acquireEditLease(
  db: Db,
  resource: LeaseResource,
  claimant: LeaseClaimant,
  now: Date = new Date(),
): Promise<EditLease> {
  const lease = await upsertLease(db, resource, claimant, now, {
    set: startedBy(claimant, now),
    setWhere: or(not(isLive(now)), eq(editLeases.userId, claimant.userId)),
  });
  if (lease) return lease;
  const current = await lastHolder(db, resource);
  // Deleting the holder's user cascades their lease away: the resource is free.
  if (!current) return acquireEditLease(db, resource, claimant, now);
  throw new LockedError(current);
}

/** Leases `resource` to the claimant, replacing any other holder. */
export async function takeOverEditLease(
  db: Db,
  resource: LeaseResource,
  claimant: LeaseClaimant,
  now: Date = new Date(),
): Promise<EditLease> {
  const lease = await upsertLease(db, resource, claimant, now, {
    set: startedBy(claimant, now),
  });
  // An upsert with no `setWhere` always writes its row.
  return lease ?? acquireEditLease(db, resource, claimant, now);
}

/** `lost` names whoever holds the lease now, and since when. */
export type EditLeaseRenewal =
  | { readonly lease: EditLease }
  | { readonly lost: { readonly by: LeaseHolder; readonly at: Date } };

/**
 * Extends the claimant's lease, keeping its `since`. A row naming someone
 * else, even lapsed or released, is `lost`: only a holder renews.
 */
export async function renewEditLease(
  db: Db,
  resource: LeaseResource,
  claimant: LeaseClaimant,
  now: Date = new Date(),
): Promise<EditLeaseRenewal> {
  const lease = await upsertLease(db, resource, claimant, now, {
    set: { surface: claimant.surface, expiresAt: expiryFrom(now) },
    setWhere: eq(editLeases.userId, claimant.userId),
  });
  if (lease) return { lease };
  const current = await lastHolder(db, resource);
  if (!current) return renewEditLease(db, resource, claimant, now);
  return { lost: { by: current.holder, at: current.since } };
}

/**
 * Lapses the user's lease one renewal interval from now, not at once: their
 * other tabs share it, and an open one renews it before then.
 */
export async function releaseEditLease(
  db: Db,
  resource: LeaseResource,
  userId: number,
  now: Date = new Date(),
): Promise<void> {
  const lapsesAt = new Date(now.getTime() + EDIT_LEASE_RENEW_INTERVAL_MS);
  await db
    .update(editLeases)
    .set({ expiresAt: lapsesAt })
    .where(
      and(
        isResource(resource),
        eq(editLeases.userId, userId),
        gt(editLeases.expiresAt, lapsesAt),
      ),
    );
}

/**
 * Unlike {@link releaseEditLease}, which keeps the lease a renewal interval
 * longer for an editor's tabs, frees it at once.
 */
export async function lapseEditLease(
  db: Db,
  resource: LeaseResource,
  userId: number,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(editLeases)
    .set({ expiresAt: now })
    .where(
      and(isResource(resource), eq(editLeases.userId, userId), isLive(now)),
    );
}

/**
 * Refuses a write from a copy with `LockedError` while another user holds a
 * live lease on `resource`; with `takeOver`, takes the lease over instead. A
 * system write never calls it.
 */
export async function assertWritable(
  db: Db,
  resource: LeaseResource,
  writer: LeaseClaimant,
  options: { readonly takeOver?: boolean } = {},
  now: Date = new Date(),
): Promise<void> {
  const lease = await readEditLease(db, resource, now);
  if (!lease || lease.holder.id === writer.userId) return;
  if (!options.takeOver) throw new LockedError(lease);
  await takeOverEditLease(db, resource, writer, now);
}
