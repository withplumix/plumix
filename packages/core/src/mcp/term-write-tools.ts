import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { McpTool } from "../context/mcp-tool.js";
import { idParam } from "../rpc/contract/validation.js";
import {
  termCreateInputSchema,
  termUpdateInputSchema,
} from "../rpc/procedures/term/schemas.js";
import {
  asWriteToolError,
  holdingLease,
  WRITE,
} from "./content-write-tools.js";
import { mcpRouterClient } from "./router-client.js";

const createInputSchema = termCreateInputSchema;

const updateInputSchema = v.object({
  ...v.pick(termUpdateInputSchema, [
    "name",
    "slug",
    "description",
    "parentId",
    "meta",
  ]).entries,
  taxonomy: v.pipe(
    v.string(),
    v.description("Taxonomy the id must belong to."),
  ),
  id: idParam,
  ifMatch: v.pipe(
    v.string(),
    v.description(
      "The term's `etag` from `term_get`, or from your last write. After a `conflict`, call `term_get` again, reapply your change to what it returns, and retry with the new etag.",
    ),
  ),
});

export const termCreateTool: McpTool<typeof createInputSchema> = {
  name: "term_create",
  description:
    "Create a term in a taxonomy. Returns its id and etag; send that etag as `ifMatch` to `term_update`.",
  inputSchema: createInputSchema,
  annotations: WRITE,
  async run(ctx, input) {
    try {
      const created = await mcpRouterClient(ctx).term.create(input);
      return { id: created.id, etag: created.etag };
    } catch (error) {
      throw asWriteToolError(error, "term_create", { subject: "term" });
    }
  },
};

export const termUpdateTool: McpTool<typeof updateInputSchema> = {
  name: "term_update",
  description:
    "Update a term. The fields you send change; the rest stay. Requires `ifMatch`. Returns id and etag.",
  inputSchema: updateInputSchema,
  annotations: WRITE,
  async run(ctx, { taxonomy, ...input }) {
    const client = mcpRouterClient(ctx);
    try {
      const existing = await client.term.get({ id: input.id });
      // A taxonomy mismatch stays hidden as not-found.
      if (existing.taxonomy !== taxonomy) {
        throw new ORPCError("NOT_FOUND", {
          data: { kind: "term", id: input.id },
        });
      }
      const updated = await holdingLease(
        ctx,
        { kind: "term", id: input.id },
        () => client.term.lease.acquire({ id: input.id }),
        () => client.term.update(input),
      );
      return { id: updated.id, etag: updated.etag };
    } catch (error) {
      throw asWriteToolError(error, "term_update", { subject: "term" });
    }
  },
};
