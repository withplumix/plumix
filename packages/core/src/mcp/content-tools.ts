import * as v from "valibot";

import type { McpTool } from "./tool.js";
import { EntryReadError } from "../entries/errors.js";
import { getEntry, listEntries } from "../entries/read-service.js";
import { entryListInputSchema } from "../rpc/procedures/entry/schemas.js";
import { idParam } from "../rpc/validation.js";
import { McpToolError } from "./errors.js";

// Curated read surface: the entries list shape minus the admin-shaped filters
// (author / parent / taxonomy). Picked from the canonical schema so validation
// and the advertised JSON Schema can't drift from it.
const contentListInputSchema = v.pick(entryListInputSchema, [
  "type",
  "status",
  "search",
  "orderBy",
  "order",
  "limit",
  "offset",
]);

const contentGetInputSchema = v.object({
  type: v.pipe(v.string(), v.description("Entry type the id must belong to.")),
  id: idParam,
});

function asMcpToolError(error: unknown): McpToolError {
  if (!(error instanceof EntryReadError)) throw error;
  switch (error.data.code) {
    case "not_found":
      return McpToolError.notFound(error.message);
    case "forbidden":
      return McpToolError.forbidden(error.message);
    case "reserved_type":
      return McpToolError.badInput(error.message);
  }
}

export const contentListTool: McpTool<typeof contentListInputSchema> = {
  name: "content_list",
  description:
    "List entries of a type, filtered by status/search and ordered/paginated. Results are clamped to what your token may read.",
  inputSchema: contentListInputSchema,
  async run(ctx, input) {
    try {
      return await listEntries(ctx, input);
    } catch (error) {
      throw asMcpToolError(error);
    }
  },
};

export const contentGetTool: McpTool<typeof contentGetInputSchema> = {
  name: "content_get",
  description: "Read a single entry in full by its type and id.",
  inputSchema: contentGetInputSchema,
  async run(ctx, input) {
    try {
      const entry = await getEntry(ctx, { id: input.id });
      // Scope the lookup to the requested type — a mismatch stays hidden as
      // not-found rather than leaking that an id exists under another type.
      if (entry.type !== input.type) {
        throw EntryReadError.notFound(input.id);
      }
      return entry;
    } catch (error) {
      throw asMcpToolError(error);
    }
  },
};
