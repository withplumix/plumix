import { and, eq, isUniqueConstraintError } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { taxonomyCapability } from "./helpers.js";
import { termCreateInputSchema } from "./schemas.js";

export const create = base
  .use(authenticated)
  .input(termCreateInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:term.create:input",
      input,
    );

    if (!context.plugins.taxonomies.has(filtered.taxonomy)) {
      throw errors.NOT_FOUND({
        data: { kind: "taxonomy", id: filtered.taxonomy },
      });
    }

    const editCap = taxonomyCapability(filtered.taxonomy, "edit");
    if (!context.auth.can(editCap)) {
      throw errors.FORBIDDEN({ data: { capability: editCap } });
    }

    if (filtered.parentId !== undefined && filtered.parentId !== null) {
      const parent = await context.db.query.terms.findFirst({
        where: and(
          eq(terms.id, filtered.parentId),
          eq(terms.taxonomy, filtered.taxonomy),
        ),
      });
      if (!parent) {
        throw errors.CONFLICT({ data: { reason: "parent_mismatch" } });
      }
    }

    let created;
    try {
      [created] = await context.db
        .insert(terms)
        .values({
          taxonomy: filtered.taxonomy,
          name: filtered.name,
          slug: filtered.slug,
          description: filtered.description ?? null,
          parentId: filtered.parentId ?? null,
        })
        .returning();
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw errors.CONFLICT({ data: { reason: "slug_taken" } });
      }
      throw error;
    }
    if (!created) {
      throw errors.CONFLICT({ data: { reason: "insert_failed" } });
    }

    return context.hooks.applyFilter("rpc:term.create:output", created);
  });
