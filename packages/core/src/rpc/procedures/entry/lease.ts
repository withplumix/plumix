import * as v from "valibot";

import type { AuthenticatedAppContext } from "../../../context/app-context.js";
import type { LeaseClaimant, LeaseResource } from "../../../db/edit-lease.js";
import type { GatedLookupErrors } from "../../../rpc-errors.js";
import {
  acquireEditLease,
  releaseEditLease,
  renewEditLease,
  takeOverEditLease,
} from "../../../db/edit-lease.js";
import { loadAuthoredEntry } from "../../../entries/authored.js";
import { assertCanEditEntry } from "../../../entries/editability.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { idParam } from "../../contract/validation.js";
import { rpcSurface } from "./concurrency.js";

/** Only someone who may edit the entry may hold its lease. */
async function editableEntry(
  context: AuthenticatedAppContext,
  id: number,
  errors: GatedLookupErrors,
): Promise<{ resource: LeaseResource; claimant: LeaseClaimant }> {
  const entry = await loadAuthoredEntry(context.db, id);
  if (!entry) throw errors.NOT_FOUND({ data: { kind: "entry", id } });
  assertCanEditEntry(context, entry, errors);
  return {
    resource: { kind: "entry", id: entry.id },
    claimant: { userId: context.user.id, surface: rpcSurface(context) },
  };
}

export const acquire = base
  .use(authenticated)
  .input(v.object({ id: idParam, takeOver: v.optional(v.boolean()) }))
  .handler(async ({ input, context, errors }) => {
    const { resource, claimant } = await editableEntry(
      context,
      input.id,
      errors,
    );
    return input.takeOver === true
      ? takeOverEditLease(context.db, resource, claimant)
      : acquireEditLease(context.db, resource, claimant);
  });

export const renew = base
  .use(authenticated)
  .input(v.object({ id: idParam }))
  .handler(async ({ input, context, errors }) => {
    const { resource, claimant } = await editableEntry(
      context,
      input.id,
      errors,
    );
    return renewEditLease(context.db, resource, claimant);
  });

/** Best-effort: a tab that closes without it lets the lease lapse. */
export const release = base
  .use(authenticated)
  .input(v.object({ id: idParam }))
  .handler(async ({ input, context }) => {
    await releaseEditLease(
      context.db,
      { kind: "entry", id: input.id },
      context.user.id,
    );
  });
