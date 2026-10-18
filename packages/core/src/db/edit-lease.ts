import type { SQL } from "drizzle-orm";

import type { Db } from "../context/app-context.js";
import type { EditLeaseSurface } from "./schema/edit_leases.js";
import { and, eq, gt, not, or } from "./index.js";
import { editLeases } from "./schema/edit_leases.js";
import { users } from "./schema/users.js";

/** How long a lease lasts after its last renewal. */
export const EDIT_LEASE_DURATION_MS = 120_000;

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

  constructor(lease: EditLease) {
    super(`${lease.holder.name} is editing this resource.`);
    this.name = "LockedError";
    this.holder = lease.holder;
    this.since = lease.since;
  }

  get data(): { readonly holder: LeaseHolder; readonly since: Date } {
    return { holder: this.holder, since: this.since };
  }
}

/** Moves the claimant's own live lease on, keeping when they took it. */
async function extendOwnLease(
  db: Db,
  resource: LeaseResource,
  claimant: LeaseClaimant,
  now: Date,
): Promise<boolean> {
  const rows = await db
    .update(editLeases)
    .set({ surface: claimant.surface, expiresAt: expiryFrom(now) })
    .where(
      and(
        isResource(resource),
        eq(editLeases.userId, claimant.userId),
        isLive(now),
      ),
    )
    .returning({ userId: editLeases.userId });
  return rows.length > 0;
}

/**
 * Starts the claimant's lease. Without `setWhere` it replaces whoever holds
 * it; with it, only a row `setWhere` matches.
 */
async function startLease(
  db: Db,
  resource: LeaseResource,
  claimant: LeaseClaimant,
  now: Date,
  setWhere?: SQL,
): Promise<boolean> {
  const lease = {
    userId: claimant.userId,
    surface: claimant.surface,
    since: now,
    expiresAt: expiryFrom(now),
  };
  const rows = await db
    .insert(editLeases)
    .values({
      resourceKind: resource.kind,
      resourceId: String(resource.id),
      ...lease,
    })
    .onConflictDoUpdate({
      target: [editLeases.resourceKind, editLeases.resourceId],
      set: lease,
      setWhere,
    })
    .returning({ userId: editLeases.userId });
  return rows.length > 0;
}

/**
 * Leases `resource` to the claimant, or renews the lease they hold. Throws
 * `LockedError` while another user holds it.
 */
export async function acquireEditLease(
  db: Db,
  resource: LeaseResource,
  claimant: LeaseClaimant,
  now: Date = new Date(),
): Promise<EditLease> {
  for (;;) {
    const claimed =
      (await extendOwnLease(db, resource, claimant, now)) ||
      (await startLease(
        db,
        resource,
        claimant,
        now,
        or(not(isLive(now)), eq(editLeases.userId, claimant.userId)),
      ));
    const lease = await readEditLease(db, resource, now);
    // The holder released it between the claim and the read: claim again.
    if (!lease) continue;
    if (claimed) return lease;
    throw new LockedError(lease);
  }
}

/** Leases `resource` to the claimant, replacing any other holder. */
export async function takeOverEditLease(
  db: Db,
  resource: LeaseResource,
  claimant: LeaseClaimant,
  now: Date = new Date(),
): Promise<EditLease> {
  for (;;) {
    await startLease(db, resource, claimant, now);
    const lease = await readEditLease(db, resource, now);
    // Released between the write and the read: write it again.
    if (lease) return lease;
  }
}

/** `lost` names whoever holds the lease now, and since when. */
export type EditLeaseRenewal =
  | { readonly lease: EditLease }
  | { readonly lost: { readonly by: LeaseHolder; readonly at: Date } };

/**
 * Extends the claimant's lease, or takes it again once it lapsed. Reports
 * `lost` while another user holds it, rather than throwing.
 */
export async function renewEditLease(
  db: Db,
  resource: LeaseResource,
  claimant: LeaseClaimant,
  now: Date = new Date(),
): Promise<EditLeaseRenewal> {
  try {
    return { lease: await acquireEditLease(db, resource, claimant, now) };
  } catch (error) {
    if (!(error instanceof LockedError)) throw error;
    return { lost: { by: error.holder, at: error.since } };
  }
}

/** Ends the user's lease on `resource`; a lease someone else holds stays. */
export async function releaseEditLease(
  db: Db,
  resource: LeaseResource,
  userId: number,
): Promise<void> {
  await db
    .delete(editLeases)
    .where(and(isResource(resource), eq(editLeases.userId, userId)));
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
