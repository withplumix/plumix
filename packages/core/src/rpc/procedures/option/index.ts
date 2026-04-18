import { del } from "./delete.js";
import { get } from "./get.js";
import { list } from "./list.js";
import { set } from "./set.js";

export const optionRouter = {
  list,
  get,
  set,
  delete: del,
} as const;

export type OptionRouter = typeof optionRouter;
