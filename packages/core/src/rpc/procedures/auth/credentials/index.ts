import { del } from "./delete.js";
import { list } from "./list.js";
import { rename } from "./rename.js";

export const credentialsRouter = {
  list,
  rename,
  delete: del,
} as const;
