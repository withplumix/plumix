import { create } from "./create.js";
import { del } from "./delete.js";
import { get } from "./get.js";
import {
  acquire as leaseAcquire,
  release as leaseRelease,
  renew as leaseRenew,
} from "./lease.js";
import { list } from "./list.js";
import { update } from "./update.js";

export const termRouter = {
  list,
  get,
  create,
  update,
  delete: del,
  lease: { acquire: leaseAcquire, renew: leaseRenew, release: leaseRelease },
} as const;

export type TermRouter = typeof termRouter;
