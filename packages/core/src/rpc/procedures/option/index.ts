import { del } from "./delete.js";
import { getMany } from "./get-many.js";
import { get } from "./get.js";
import { list } from "./list.js";
import { set } from "./set.js";

export const optionRouter = {
  list,
  get,
  getMany,
  set,
  delete: del,
} as const;

export type OptionRouter = typeof optionRouter;
