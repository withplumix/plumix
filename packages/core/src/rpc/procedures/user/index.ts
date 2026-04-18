import { del } from "./delete.js";
import { disable } from "./disable.js";
import { get } from "./get.js";
import { invite } from "./invite.js";
import { list } from "./list.js";
import { update } from "./update.js";

export const userRouter = {
  list,
  get,
  invite,
  update,
  disable,
  delete: del,
} as const;

export type UserRouter = typeof userRouter;
