import { adminList } from "./admin-list.js";
import { adminRevoke } from "./admin-revoke.js";
import { list } from "./list.js";
import { revoke } from "./revoke.js";

export const oauthGrantsRouter = {
  list,
  revoke,
  adminList,
  adminRevoke,
} as const;
