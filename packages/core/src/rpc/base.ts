import { os } from "@orpc/server";

import type { AppContext } from "../context/app-context.js";
import { RPC_ERRORS } from "../rpc-errors.js";

export const base = os.$context<AppContext>().errors(RPC_ERRORS);

export type Base = typeof base;

/** Marks that let a test find every core procedure of a kind. */
export interface CoreProcedureMeta {
  readonly modifiesUser?: true;
  /** Creates or redirects a credential, for the caller or another user. */
  readonly createsCredential?: true;
  /** Revokes or removes a credential, a session, an OAuth link or a grant. */
  readonly removesCredential?: true;
}

/**
 * Core's own procedures build on this; `base` stays unmarked, since plugins
 * build on it too.
 */
export const coreBase = base.$meta<CoreProcedureMeta>({});
