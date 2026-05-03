import { adminList } from "./admin-list.js";
import { adminRevoke } from "./admin-revoke.js";
import { create } from "./create.js";
import { list } from "./list.js";
import { revoke } from "./revoke.js";

export const apiTokensRouter = {
  list,
  create,
  revoke,
  adminList,
  adminRevoke,
} as const;
