import { create } from "./create.js";
import { get } from "./get.js";
import { list } from "./list.js";
import { trash } from "./trash.js";
import { update } from "./update.js";

export const postRouter = {
  list,
  get,
  create,
  update,
  trash,
} as const;

export type PostRouter = typeof postRouter;
