import { approve } from "./approve.js";
import { deny } from "./deny.js";
import { lookup } from "./lookup.js";

export const deviceFlowRouter = {
  lookup,
  approve,
  deny,
} as const;
