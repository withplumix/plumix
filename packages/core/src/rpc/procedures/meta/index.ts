import * as v from "valibot";

import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { requireCapability } from "../../require-capability.js";
import { META_STORES, sweepUnsettledMeta } from "./sweep.js";

// Settling rewrites stored content across every store on the site — the same
// reach as a settings save, so the same gate.
const sweep = base
  .use(authenticated)
  .use(requireCapability("settings:manage"))
  .input(
    v.object({
      write: v.boolean(),
      cursor: v.optional(
        v.nullable(
          v.object({
            store: v.picklist(META_STORES),
            after: v.pipe(v.number(), v.integer(), v.minValue(0)),
            setting: v.optional(
              v.object({ group: v.string(), key: v.string() }),
            ),
          }),
        ),
      ),
    }),
  )
  .handler(({ input, context }) => sweepUnsettledMeta(context, input));

export const metaRouter = {
  sweep,
} as const;
