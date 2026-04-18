import { create } from "./create.js";
import { del } from "./delete.js";
import { get } from "./get.js";
import { list } from "./list.js";
import { update } from "./update.js";

export const termRouter = {
  list,
  get,
  create,
  update,
  delete: del,
} as const;

export type TermRouter = typeof termRouter;
