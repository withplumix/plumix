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
import { eq } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { idParam } from "../../contract/validation.js";
import { rpcSurface } from "../entry/concurrency.js";
import { assertCanEditUser } from "./helpers.js";

/** Only someone who may edit the user may hold their lease. */
async function editableUser(
  context: AuthenticatedAppContext,
  id: number,
  errors: GatedLookupErrors,
): Promise<{ resource: LeaseResource; claimant: LeaseClaimant }> {
  const user = await context.db.query.users.findFirst({
    columns: { id: true },
    where: eq(users.id, id),
  });
  if (!user) throw errors.NOT_FOUND({ data: { kind: "user", id } });
  assertCanEditUser(context, user, {
    forbidden: (capability) => {
      throw errors.FORBIDDEN({ data: { capability } });
    },
  });
  return {
    resource: { kind: "user", id: user.id },
    claimant: { userId: context.user.id, surface: rpcSurface(context) },
  };
}

export const acquire = base
  .use(authenticated)
  .input(v.object({ id: idParam, takeOver: v.optional(v.boolean()) }))
  .handler(async ({ input, context, errors }) => {
    const { resource, claimant } = await editableUser(
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
    const { resource, claimant } = await editableUser(
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
      { kind: "user", id: input.id },
      context.user.id,
    );
  });
