import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { BlockContentValidationIssue } from "../blocks/validation-errors.js";
import type { AppContext } from "../context/app-context.js";
import type { McpTool } from "../context/mcp-tool.js";
import type { LeaseResource } from "../db/edit-lease.js";
import { lapseEditLease } from "../db/edit-lease.js";
import { idParam } from "../rpc/contract/validation.js";
import {
  entryCreateInputSchema,
  entryUpdateInputSchema,
} from "../rpc/procedures/entry/schemas.js";
import {
  allowedChildren,
  allowedTopLevel,
  tokensForProperty,
} from "./block-catalog.js";
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

export const typeParam = v.pipe(
  v.string(),
  v.description("Entry type the id must belong to."),
);

const updateInputSchema = v.object({
  ...updatedFields.entries,
  type: typeParam,
  id: idParam,
  ifMatch: v.pipe(
    v.string(),
    v.description(
      "The entry's `etag` from `content_get`, or from your last write. After a `conflict`, call `content_get` again, reapply your change to what it returns, and retry with the new etag.",
    ),
  ),
});

export const WRITE = { readOnlyHint: false, destructiveHint: false } as const;

interface IssueData {
  readonly issues: readonly BlockContentValidationIssue[];
}

const SUBJECTS = {
  entry: { noun: "entry", getTool: "content_get", listTool: "content_list" },
  term: { noun: "term", getTool: "term_get", listTool: "term_list" },
} as const;

interface RefusalWording {
  readonly subject?: keyof typeof SUBJECTS;
  readonly takesContent?: boolean;
}

export function asWriteToolError(
  ctx: AppContext,
  error: unknown,
  tool: string,
  { subject = "entry", takesContent = true }: RefusalWording = {},
): McpToolError {
  if (!(error instanceof ORPCError)) throw error;
  const data: unknown = error.data;
  const { noun, getTool, listTool } = SUBJECTS[subject];
  switch (error.code) {
    case "NOT_FOUND": {
      const kind = (data as { kind?: string } | undefined)?.kind;
      if (kind === "revision") {
        return McpToolError.notFound(
          "No such revision. Call revision_list to find one.",
        );
      }
      if (kind === "taxonomy") {
        return McpToolError.notFound(
          "No such taxonomy. Call taxonomy_list to find one.",
        );
      }
      return McpToolError.notFound(
        `No such ${noun}. Call ${listTool} to find one.`,
      );
    }
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
        `${holder.name} has been editing this ${noun} since ${since.toISOString()}. Report this to the user and stop; do not retry.`,
      );
    }
    case "INVALID_BLOCK_CONTENT": {
      const { issues } = data as IssueData;
      const failing = issues
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join("; ");
      return McpToolError.invalidContent(
        takesContent
          ? [
              `${failing}.`,
              ...alternativesFor(ctx, issues),
              `Fix these nodes and call ${tool} again.`,
            ].join(" ")
          : `${failing}. Report this to the user and stop; ${tool} takes no content you could fix.`,
      );
    }
    case "CONFLICT": {
      const { reason, etag } = data as { reason: string; etag?: string };
      if (reason === "etag_mismatch") {
        return McpToolError.conflict(
          `The ${noun} changed since you read it; its current etag is ${etag ?? "unknown"}. Call ${getTool}, reapply your change to what it returns, and retry ${tool} with the new etag as ifMatch.`,
        );
      }
      return McpToolError.conflict(
        `${reason}. Change the input and call ${tool} again.`,
      );
    }
    case "BAD_REQUEST":
      return McpToolError.badInput((data as { reason: string }).reason);
    default:
      throw error;
  }
}

function alternativesFor(
  ctx: AppContext,
  issues: IssueData["issues"],
): readonly string[] {
  const lines = new Set<string>();
  for (const issue of issues) {
    if (
      issue.code === "disallowed_child" ||
      issue.code === "block_not_allowed" ||
      issue.code === "unknown_block_type" ||
      issue.code === "requires_parent"
    ) {
      if (issue.slotName !== undefined && issue.parentName !== undefined) {
        const allowed = allowedChildren(ctx, issue.parentName, issue.slotName);
        lines.add(
          `Slot "${issue.slotName}" of "${issue.parentName}" allows: ${allowed.join(", ") || "none"}.`,
        );
      } else {
        lines.add(`Allowed blocks: ${allowedTopLevel(ctx).join(", ")}.`);
      }
    } else if (
      issue.code === "style_not_allowed" &&
      issue.property !== undefined &&
      issue.property !== "className"
    ) {
      const { category, uses } = tokensForProperty(
        ctx.stylePolicy,
        issue.property,
      );
      lines.add(`Tokens for "${category}": ${uses.join(", ") || "none"}.`);
    }
  }
  return [...lines];
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
      throw asWriteToolError(ctx, error, "content_create");
    }
  },
};

type RouterClient = ReturnType<typeof mcpRouterClient>;

/** A type mismatch stays hidden as not-found. */
export async function entryOfType(
  client: RouterClient,
  type: string,
  id: number,
): Promise<Awaited<ReturnType<RouterClient["entry"]["get"]>>> {
  const existing = await client.entry.get({ id });
  if (existing.type !== type) {
    throw new ORPCError("NOT_FOUND", { data: { kind: "entry", id } });
  }
  return existing;
}

/**
 * Held for this call only: the write is checked against the lease, and the
 * agent never keeps one between calls.
 */
export async function holdingLease<T>(
  ctx: AppContext,
  resource: LeaseResource,
  acquire: () => Promise<{ readonly holder: { readonly id: number } }>,
  write: () => Promise<T>,
): Promise<T> {
  let holderId: number | undefined;
  try {
    holderId = (await acquire()).holder.id;
    return await write();
  } finally {
    if (holderId !== undefined) {
      await lapseEditLease(ctx.db, resource, holderId);
    }
  }
}

export const contentUpdateTool: McpTool<typeof updateInputSchema> = {
  name: "content_update",
  description:
    "Update a draft entry. The fields you send are merged; `content`, when sent, replaces the whole block tree and every stored block the new tree still holds (by id) is kept. Requires `ifMatch`. Returns id, etag and status.",
  inputSchema: updateInputSchema,
  annotations: WRITE,
  async run(ctx, { type, ...input }) {
    const client = mcpRouterClient(ctx);
    try {
      await entryOfType(client, type, input.id);
      const written = await holdingLease(
        ctx,
        { kind: "entry", id: input.id },
        () => client.entry.lease.acquire({ id: input.id }),
        () => client.entry.update(input),
      );
      return { id: written.id, etag: written.etag, status: written.status };
    } catch (error) {
      throw asWriteToolError(ctx, error, "content_update");
    }
  },
};
