import * as v from "valibot";

import type { AuthenticatedAppContext } from "../context/app-context.js";
import type { LeaseResource } from "../db/edit-lease.js";
import type { EditLeaseSurface } from "../db/schema/edit_leases.js";
import type { GatedLookupErrors } from "../rpc-errors.js";
import {
  acquireEditLease,
  assertWritable,
  releaseEditLease,
  renewEditLease,
  takeOverEditLease,
} from "../db/edit-lease.js";
import { authenticated } from "./authenticated.js";
import { base } from "./base.js";
import { idParam } from "./contract/validation.js";

/** Where a caller who left out `ifMatch` finds the `etag` of a `kind`. */
export function ifMatchMessage(kind: string): string {
  return `Send the ${kind}'s \`etag\` from \`${kind}.get\` as \`ifMatch\``;
}

/** A session is the admin's; an API token is a client calling RPC itself. */
export function rpcSurface(context: AuthenticatedAppContext): EditLeaseSurface {
  return context.tokenScopes === null ? "admin" : "rpc";
}

/** Refuses a write from a copy while another user holds the resource's lease. */
export function assertLeaseAllows(
  context: AuthenticatedAppContext,
  resource: LeaseResource,
  takeOver: boolean | undefined,
): Promise<void> {
  return assertWritable(
    context.db,
    resource,
    { userId: context.user.id, surface: rpcSurface(context) },
    { takeOver },
  );
}

/**
 * The `lease.acquire`, `lease.renew` and `lease.release` procedures for a
 * `kind`. Only a caller `assertMayHold` lets through may acquire or renew.
 */
export function leaseProcedures(
  kind: string,
  assertMayHold: (
    context: AuthenticatedAppContext,
    id: number,
    errors: GatedLookupErrors,
  ) => Promise<void>,
) {
  const claimFor = async (
    context: AuthenticatedAppContext,
    id: number,
    errors: GatedLookupErrors,
  ) => {
    await assertMayHold(context, id, errors);
    return {
      resource: { kind, id },
      claimant: { userId: context.user.id, surface: rpcSurface(context) },
    };
  };

  const acquire = base
    .use(authenticated)
    .input(v.object({ id: idParam, takeOver: v.optional(v.boolean()) }))
    .handler(async ({ input, context, errors }) => {
      const { resource, claimant } = await claimFor(context, input.id, errors);
      return input.takeOver === true
        ? takeOverEditLease(context.db, resource, claimant)
        : acquireEditLease(context.db, resource, claimant);
    });

  const renew = base
    .use(authenticated)
    .input(v.object({ id: idParam }))
    .handler(async ({ input, context, errors }) => {
      const { resource, claimant } = await claimFor(context, input.id, errors);
      return renewEditLease(context.db, resource, claimant);
    });

  // Best-effort: a tab that closes without it lets the lease lapse.
  const release = base
    .use(authenticated)
    .input(v.object({ id: idParam }))
    .handler(async ({ input, context }) => {
      await releaseEditLease(
        context.db,
        { kind, id: input.id },
        context.user.id,
      );
    });

  return { acquire, renew, release };
}
