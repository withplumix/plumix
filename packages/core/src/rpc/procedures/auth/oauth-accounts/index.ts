import { list } from "./list.js";
import { unlink } from "./unlink.js";

export const oauthAccountsRouter = {
  list,
  unlink,
} as const;
