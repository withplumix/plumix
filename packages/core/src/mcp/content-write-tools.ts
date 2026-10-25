import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { McpTool } from "../context/mcp-tool.js";
import { lapseEditLease } from "../db/edit-lease.js";
import { idParam } from "../rpc/contract/validation.js";
import {
  entryCreateInputSchema,
  entryUpdateInputSchema,
} from "../rpc/procedures/entry/schemas.js";
import { McpToolError } from "./errors.js";
import { mcpRouterClient } from "./router-client.js";

const createInputSchema = v.object({
  ...v.pick(entryCreateInputSchema, [
    "slug",
    "title",
    "excerpt",
    "content",
    "meta",
    "terms",
  ]).entries,
  type: v.pipe(v.string(), v.description("Entry type to create a draft of.")),
});

const updatedFields = v.pick(entryUpdateInputSchema, [
  "title",
  "slug",
  "excerpt",
  "content",
  "meta",
  "terms",
]);

const updateInputSchema = v.object({
  ...updatedFields.entries,
  type: v.pipe(v.string(), v.description("Entry type the id must belong to.")),
  id: idParam,
  ifMatch: v.pipe(
    v.string(),
    v.description(
      "The entry's `etag` from `content_get`, or from your last write. After a `conflict`, call `content_get` again, reapply your change to what it returns, and retry with the new etag.",
    ),
  ),
});

const WRITE = { readOnlyHint: false, destructiveHint: false } as const;

interface IssueData {
  readonly issues: readonly {
    readonly path: string;
    readonly message: string;
  }[];
}

/** What an agent should do next, per the procedure's refusal. */
function asMcpToolError(error: unknown): McpToolError {
  if (!(error instanceof ORPCError)) throw error;
  const data: unknown = error.data;
  switch (error.code) {
    case "NOT_FOUND":
      return McpToolError.notFound(
        "No such entry. Call content_list to find one.",
      );
    case "FORBIDDEN":
      return McpToolError.forbidden(
        `Your token may not do this${capabilityOf(data)}.`,
      );
    case "LOCKED": {
      const { holder, since } = data as {
        holder: { name: string };
        since: Date;
      };
      return McpToolError.locked(
        `${holder.name} has been editing this entry since ${since.toISOString()}. Report this to the user and stop; do not retry.`,
      );
    }
    case "INVALID_BLOCK_CONTENT": {
      const { issues } = data as IssueData;
      const failing = issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ");
      return McpToolError.invalidContent(
        `${failing}. Fix these nodes and call content_update again.`,
      );
    }
    case "CONFLICT": {
      const { reason, etag } = data as { reason: string; etag?: string };
      if (reason === "etag_mismatch") {
        return McpToolError.conflict(
          `The entry changed since you read it; its current etag is ${etag ?? "unknown"}. Call content_get, reapply your change to what it returns, and retry content_update with the new etag as ifMatch.`,
        );
      }
      return McpToolError.conflict(
        `${reason}. Change the input, or call content_get to see the entry.`,
      );
    }
    case "BAD_REQUEST":
      return McpToolError.badInput((data as { reason: string }).reason);
    default:
      throw error;
  }
}

function capabilityOf(data: unknown): string {
  const capability = (data as { capability?: string } | undefined)?.capability;
  return capability === undefined ? "" : ` (needs ${capability})`;
}

export const contentCreateTool: McpTool<typeof createInputSchema> = {
  name: "content_create",
  description:
    "Create a draft entry. Returns its id, etag and status; send that etag as `ifMatch` to `content_update`.",
  inputSchema: createInputSchema,
  annotations: WRITE,
  async run(ctx, input) {
    try {
      const written = await mcpRouterClient(ctx).entry.create(input);
      return { id: written.id, etag: written.etag, status: written.status };
    } catch (error) {
      throw asMcpToolError(error);
    }
  },
};

export const contentUpdateTool: McpTool<typeof updateInputSchema> = {
  name: "content_update",
  description:
    "Update a draft entry. The fields you send are merged; `content`, when sent, replaces the whole block tree and every stored block the new tree still holds (by id) is kept. Requires `ifMatch`. Returns id, etag and status.",
  inputSchema: updateInputSchema,
  annotations: WRITE,
  async run(ctx, { type, ...input }) {
    const client = mcpRouterClient(ctx);
    let holderId: number | undefined;
    try {
      const existing = await client.entry.get({ id: input.id });
      // A mismatch stays hidden as not-found, as in `content_get`.
      if (existing.type !== type) {
        throw new ORPCError("NOT_FOUND", {
          data: { kind: "entry", id: input.id },
        });
      }
      // Held for this call only: the write is checked against the lease, and
      // the agent never keeps one between calls.
      const lease = await client.entry.lease.acquire({ id: input.id });
      holderId = lease.holder.id;
      const written = await client.entry.update(input);
      return { id: written.id, etag: written.etag, status: written.status };
    } catch (error) {
      throw asMcpToolError(error);
    } finally {
      if (holderId !== undefined) {
        await lapseEditLease(ctx.db, { kind: "entry", id: input.id }, holderId);
      }
    }
  },
};
