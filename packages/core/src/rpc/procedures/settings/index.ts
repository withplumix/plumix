import { get } from "./get.js";
import {
  acquire as leaseAcquire,
  release as leaseRelease,
  renew as leaseRenew,
} from "./lease.js";
import { upsert } from "./upsert.js";

export const settingsRouter = {
  get,
  upsert,
  lease: { acquire: leaseAcquire, renew: leaseRenew, release: leaseRelease },
} as const;

export type SettingsRouter = typeof settingsRouter;
