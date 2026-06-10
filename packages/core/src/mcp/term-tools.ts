import * as v from "valibot";

import type { McpTool } from "./tool.js";
import { labelSourceText } from "../i18n/label.js";
import { termListInputSchema } from "../rpc/procedures/term/schemas.js";
import { idParam } from "../rpc/validation.js";
import { TermReadError } from "../terms/errors.js";
import { getTerm, listTerms } from "../terms/read-service.js";
import { McpToolError } from "./errors.js";

// Curated read surface: taxonomy + search + pagination, picked from the
// canonical schema so validation and the advertised JSON Schema can't drift.
const termListInput = v.pick(termListInputSchema, [
  "taxonomy",
  "search",
  "limit",
  "offset",
]);

const termGetInput = v.object({
  taxonomy: v.pipe(
    v.string(),
    v.description("Taxonomy the id must belong to."),
  ),
  id: idParam,
});

const emptyInput = v.object({});

function asMcpToolError(error: unknown): McpToolError {
  if (!(error instanceof TermReadError)) throw error;
  switch (error.data.code) {
    case "taxonomy_not_found":
    case "term_not_found":
      return McpToolError.notFound(error.message);
    case "forbidden":
      return McpToolError.forbidden(error.message);
  }
}

export const termListTool: McpTool<typeof termListInput> = {
  name: "term_list",
  description:
    "List terms (categories/tags) in a taxonomy, optionally filtered by search and paginated.",
  inputSchema: termListInput,
  async run(ctx, input) {
    try {
      return await listTerms(ctx, input);
    } catch (error) {
      throw asMcpToolError(error);
    }
  },
};

export const termGetTool: McpTool<typeof termGetInput> = {
  name: "term_get",
  description: "Read a single term in full by its taxonomy and id.",
  inputSchema: termGetInput,
  async run(ctx, input) {
    try {
      const term = await getTerm(ctx, { id: input.id });
      // Scope the lookup to the requested taxonomy — a mismatch stays hidden
      // as not-found rather than leaking that an id exists elsewhere.
      if (term.taxonomy !== input.taxonomy) {
        throw TermReadError.termNotFound(input.id);
      }
      return term;
    } catch (error) {
      throw asMcpToolError(error);
    }
  },
};

export const taxonomyListTool: McpTool<typeof emptyInput> = {
  name: "taxonomy_list",
  description:
    "List the taxonomies in the content model — name, label, whether hierarchical, and the entry types they apply to.",
  inputSchema: emptyInput,
  run(ctx) {
    return [...ctx.plugins.termTaxonomies.values()].map((taxonomy) => ({
      name: taxonomy.name,
      label: labelSourceText(taxonomy.label),
      isHierarchical: taxonomy.isHierarchical ?? false,
      entryTypes: taxonomy.entryTypes ?? [],
    }));
  },
};
