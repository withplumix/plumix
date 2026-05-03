import { list } from "./list.js";
import { revokeOthers } from "./revoke-others.js";
import { revoke } from "./revoke.js";

export const sessionsRouter = {
  list,
  revoke,
  revokeOthers,
} as const;
