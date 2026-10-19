import type { AuthenticatedAppContext } from "../../../context/app-context.js";
import type { LeaseClaimant } from "../../../db/edit-lease.js";
import {
  acquireEditLease,
  releaseEditLease,
  renewEditLease,
  takeOverEditLease,
} from "../../../db/edit-lease.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { requireCapability } from "../../require-capability.js";
import { rpcSurface } from "../entry/concurrency.js";
import { settingsGetInputSchema, settingsLeaseInputSchema } from "./schemas.js";
import { settingsGroupResource } from "./token.js";

const CAPABILITY = "settings:manage";

function claimant(context: AuthenticatedAppContext): LeaseClaimant {
  return { userId: context.user.id, surface: rpcSurface(context) };
}

export const acquire = base
  .use(authenticated)
  .use(requireCapability(CAPABILITY))
  .input(settingsLeaseInputSchema)
  .handler(({ input, context }) => {
    const resource = settingsGroupResource(input.group);
    return input.takeOver === true
      ? takeOverEditLease(context.db, resource, claimant(context))
      : acquireEditLease(context.db, resource, claimant(context));
  });

export const renew = base
  .use(authenticated)
  .use(requireCapability(CAPABILITY))
  .input(settingsGetInputSchema)
  .handler(({ input, context }) =>
    renewEditLease(
      context.db,
      settingsGroupResource(input.group),
      claimant(context),
    ),
  );

/** Best-effort: a tab that closes without it lets the lease lapse. */
export const release = base
  .use(authenticated)
  .input(settingsGetInputSchema)
  .handler(async ({ input, context }) => {
    await releaseEditLease(
      context.db,
      settingsGroupResource(input.group),
      context.user.id,
    );
  });
