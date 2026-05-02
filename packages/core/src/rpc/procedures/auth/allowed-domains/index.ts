import { create } from "./create.js";
import { del } from "./delete.js";
import { list } from "./list.js";
import { update } from "./update.js";

export const allowedDomainsRouter = {
  list,
  create,
  update,
  delete: del,
} as const;

export type AllowedDomainsRouter = typeof allowedDomainsRouter;
