import { cancelEmailChangeProc } from "./cancel-email-change.js";
import { del } from "./delete.js";
import { disable } from "./disable.js";
import { enable } from "./enable.js";
import { get } from "./get.js";
import { invite } from "./invite.js";
import {
  acquire as leaseAcquire,
  release as leaseRelease,
  renew as leaseRenew,
} from "./lease.js";
import { list } from "./list.js";
import { pendingEmailChange } from "./pending-email-change.js";
import { requestEmailChangeProc } from "./request-email-change.js";
import { setLocale } from "./set-locale.js";
import { update } from "./update.js";

export const userRouter = {
  list,
  get,
  invite,
  update,
  disable,
  enable,
  delete: del,
  setLocale,
  lease: { acquire: leaseAcquire, renew: leaseRenew, release: leaseRelease },
  requestEmailChange: requestEmailChangeProc,
  cancelEmailChange: cancelEmailChangeProc,
  pendingEmailChange,
} as const;

export type UserRouter = typeof userRouter;
