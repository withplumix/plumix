import * as v from "valibot";

import type { McpTool } from "../context/mcp-tool.js";
import { idParam } from "../rpc/contract/validation.js";
import {
  asWriteToolError,
  entryOfType,
  holdingLease,
} from "./content-write-tools.js";
import { mcpRouterClient } from "./router-client.js";

const typeParam = v.pipe(
  v.string(),
  v.description("Entry type the id must belong to."),
);

const ifMatchParam = v.pipe(
  v.string(),
  v.description(
    "The entry's `etag` from `content_get`, or from your last write. After a `conflict`, call `content_get` again and retry with the new etag.",
  ),
);

const publishInputSchema = v.object({
  type: typeParam,
  id: idParam,
  ifMatch: ifMatchParam,
});

const WRITE = { readOnlyHint: false, destructiveHint: false } as const;

export const contentPublishTool: McpTool<typeof publishInputSchema> = {
  name: "content_publish",
  description:
    "Publish an entry: a draft goes live, and a published entry's pending draft replaces what is live. Needs the publish capability and `ifMatch`. Returns id, etag and status.",
  inputSchema: publishInputSchema,
  annotations: WRITE,
  async run(ctx, { type, id, ifMatch }) {
    const client = mcpRouterClient(ctx);
    try {
      const existing = await entryOfType(client, type, id);
      const written = await holdingLease(
        ctx,
        { kind: "entry", id },
        () => client.entry.lease.acquire({ id }),
        () =>
          // A published entry publishes its pending draft; any other goes live.
          existing.status === "published"
            ? client.entry.publish({ id, ifMatch })
            : client.entry.update({ id, ifMatch, status: "published" }),
      );
      return { id: written.id, etag: written.etag, status: written.status };
    } catch (error) {
      throw asWriteToolError(error, "content_publish");
    }
  },
};

const entryRefInputSchema = v.object({ type: typeParam, id: idParam });

const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true } as const;

export const contentDiscardDraftTool: McpTool<typeof entryRefInputSchema> = {
  name: "content_discard_draft",
  description:
    "Discard your pending draft of a published entry, so the live entry stands as it is. Returns id, etag and status of the live entry.",
  inputSchema: entryRefInputSchema,
  annotations: WRITE,
  async run(ctx, { type, id }) {
    const client = mcpRouterClient(ctx);
    try {
      const existing = await entryOfType(client, type, id);
      await client.entry.discardDraft({ id });
      // The live entry is untouched, so the token read above still stands.
      return { id, etag: existing.etag, status: existing.status };
    } catch (error) {
      throw asWriteToolError(error, "content_discard_draft");
    }
  },
};

export const contentDuplicateTool: McpTool<typeof entryRefInputSchema> = {
  name: "content_duplicate",
  description:
    "Copy an entry, its terms and meta into a new draft titled '(copy)'. Returns the copy's id, etag and status.",
  inputSchema: entryRefInputSchema,
  annotations: WRITE,
  async run(ctx, { type, id }) {
    const client = mcpRouterClient(ctx);
    try {
      await entryOfType(client, type, id);
      const copy = await client.entry.duplicate({ id });
      return { id: copy.id, etag: copy.etag, status: copy.status };
    } catch (error) {
      throw asWriteToolError(error, "content_duplicate", {
        contentFixable: false,
      });
    }
  },
};

export const contentTrashTool: McpTool<typeof entryRefInputSchema> = {
  name: "content_trash",
  description:
    "Move an entry to the trash, which takes it off the site. `content_restore` brings it back as a draft; nothing here deletes it for good. Returns id, etag and status.",
  inputSchema: entryRefInputSchema,
  annotations: DESTRUCTIVE,
  async run(ctx, { type, id }) {
    const client = mcpRouterClient(ctx);
    try {
      await entryOfType(client, type, id);
      const trashed = await client.entry.trash({ id });
      return { id: trashed.id, etag: trashed.etag, status: trashed.status };
    } catch (error) {
      throw asWriteToolError(error, "content_trash");
    }
  },
};

export const contentRestoreTool: McpTool<typeof entryRefInputSchema> = {
  name: "content_restore",
  description:
    "Restore a trashed entry as a draft. Returns id, etag and status.",
  inputSchema: entryRefInputSchema,
  annotations: WRITE,
  async run(ctx, { type, id }) {
    const client = mcpRouterClient(ctx);
    try {
      await entryOfType(client, type, id);
      const restored = await client.entry.restore({ id });
      return { id: restored.id, etag: restored.etag, status: restored.status };
    } catch (error) {
      throw asWriteToolError(error, "content_restore");
    }
  },
};
