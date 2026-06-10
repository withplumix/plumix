import * as v from "valibot";

import type { McpTool } from "./tool.js";
import { ENTRY_STATUSES } from "../db/schema/entries.js";
import { labelSourceText } from "../i18n/label.js";
import { McpToolError } from "./errors.js";

const inputSchema = v.object({
  type: v.optional(
    v.pipe(
      v.string(),
      v.description(
        "Entry type name to inspect; omit to list the whole model.",
      ),
    ),
  ),
});

/**
 * The content-model introspection tool. With no argument it lists entry types
 * and taxonomies; with a `type` it returns that type's statuses, supports, and
 * taxonomies. Backed entirely by the in-memory manifest — no DB access.
 */
export const schemaDescribeTool: McpTool<typeof inputSchema> = {
  name: "schema_describe",
  description:
    "Describe the content model — entry types, statuses, supports, and taxonomies. Call with no argument to list everything, or with `type` to inspect one entry type.",
  inputSchema,
  run(ctx, input) {
    const { entryTypes, termTaxonomies } = ctx.plugins;

    if (input.type === undefined) {
      return {
        entryTypes: [...entryTypes.values()].map((entryType) => ({
          name: entryType.name,
          label: labelSourceText(entryType.label),
          isHierarchical: entryType.isHierarchical ?? false,
          supports: entryType.supports ?? [],
          taxonomies: entryType.termTaxonomies ?? [],
        })),
        taxonomies: [...termTaxonomies.values()].map((taxonomy) => ({
          name: taxonomy.name,
          label: labelSourceText(taxonomy.label),
          isHierarchical: taxonomy.isHierarchical ?? false,
        })),
      };
    }

    const entryType = entryTypes.get(input.type);
    if (entryType === undefined) {
      throw McpToolError.notFound(`unknown entry type: "${input.type}"`);
    }
    return {
      name: entryType.name,
      label: labelSourceText(entryType.label),
      isHierarchical: entryType.isHierarchical ?? false,
      statuses: [...ENTRY_STATUSES],
      supports: entryType.supports ?? [],
      taxonomies: entryType.termTaxonomies ?? [],
    };
  },
};
