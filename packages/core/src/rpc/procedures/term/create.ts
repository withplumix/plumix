import { and, eq, isUniqueConstraintError } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { taxonomyCapability } from "./helpers.js";
import {
  decodeMetaBag,
  loadTermMeta,
  sanitizeMetaForRpc,
  validateTermMetaReferences,
  writeTermMeta,
} from "./meta.js";
import { termCreateInputSchema } from "./schemas.js";

export const create = base
  .use(authenticated)
  .input(termCreateInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:term.create:input",
      input,
    );

    if (!context.plugins.termTaxonomies.has(filtered.taxonomy)) {
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

    // Validate meta up-front so a bad key fails before the term insert —
    // keeps the DB clean when the client sends a typo in a meta key.
    const metaPatch = sanitizeMetaForRpc(
      context.plugins,
      filtered.taxonomy,
      filtered.meta,
      errors,
    );
    if (metaPatch) {
      await validateTermMetaReferences(
        context,
        filtered.taxonomy,
        metaPatch,
        errors,
      );
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

    let meta: Record<string, unknown>;
    if (metaPatch) {
      await writeTermMeta(context, created, metaPatch);
      meta = await loadTermMeta(context, created);
    } else {
      meta = decodeMetaBag(context.plugins, created.taxonomy, created.meta);
    }

    await context.hooks.doAction("term:created", created);
    return context.hooks.applyFilter("rpc:term.create:output", {
      ...created,
      meta,
    });
  });
