import { approve } from "./approve.js";
import { deny } from "./deny.js";
import { lookup } from "./lookup.js";

export const oauthConsentRouter = {
  lookup,
  approve,
  deny,
} as const;
