import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { McpTool } from "../context/mcp-tool.js";
import { decodeRevisionSlug } from "../revisions/slug-codec.js";
import { idParam } from "../rpc/contract/validation.js";
import { ifMatchParam } from "./content-lifecycle-tools.js";
import {
  asWriteToolError,
  entryOfType,
  holdingLease,
  typeParam,
  WRITE,
} from "./content-write-tools.js";
import { mcpRouterClient } from "./router-client.js";

const listInputSchema = v.object({
  type: typeParam,
  id: idParam,
  limit: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)),
  ),
  cursor: v.optional(
    v.pipe(
      v.string(),
      v.maxLength(32),
      v.description("The `nextCursor` of the previous page."),
    ),
  ),
});

const restoreInputSchema = v.object({
  revisionId: idParam,
  ifMatch: ifMatchParam,
});

export const revisionListTool: McpTool<typeof listInputSchema> = {
  name: "revision_list",
  description:
    "List an entry's revisions, newest first: id, title, author, message and time. Pass a revision's id to `revision_restore`.",
  inputSchema: listInputSchema,
  annotations: { readOnlyHint: true },
  async run(ctx, { type, id, limit, cursor }) {
    const client = mcpRouterClient(ctx);
    try {
      await entryOfType(client, type, id);
      return await client.entry.revisions.list({
        entryId: id,
        ...(limit === undefined ? {} : { limit }),
        ...(cursor === undefined ? {} : { cursor }),
      });
    } catch (error) {
      throw asWriteToolError(ctx, error, "revision_list");
    }
  },
};

export const revisionRestoreTool: McpTool<typeof restoreInputSchema> = {
  name: "revision_restore",
  description:
    "Restore a revision onto its entry, replacing its title, content and meta with the revision's. Needs `ifMatch`. Returns id, etag and status.",
  inputSchema: restoreInputSchema,
  annotations: WRITE,
  async run(ctx, { revisionId, ifMatch }) {
    const client = mcpRouterClient(ctx);
    try {
      const revision = await client.entry.revisions.get({ revisionId });
      const entryId = decodeRevisionSlug(revision.slug)?.entryId;
      if (entryId === undefined) {
        throw new ORPCError("NOT_FOUND", {
          data: { kind: "revision", id: revisionId },
        });
      }
      const written = await holdingLease(
        ctx,
        { kind: "entry", id: entryId },
        () => client.entry.lease.acquire({ id: entryId }),
        () => client.entry.revisions.restore({ revisionId, ifMatch }),
      );
      return { id: written.id, etag: written.etag, status: written.status };
    } catch (error) {
      throw asWriteToolError(ctx, error, "revision_restore", {
        takesContent: false,
      });
    }
  },
};
