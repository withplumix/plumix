import type { ResolvedMeta } from "../../../meta/contract/bags.js";
import { spellTermCapability } from "../../../access/contract/capability.js";
import { and, eq, isUniqueConstraintError } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";
import { startingMeta } from "../../../plugin/fields/starting-meta.js";
import { listTermMetaFields } from "../../../plugin/manifest.js";
import {
  assertTermMetaCapabilities,
  loadTermMeta,
  resolveTermMeta,
  sanitizeMetaForRpc,
  validateTermMetaReferences,
  writeTermMeta,
} from "../../../meta/term.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
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

    const editCap = spellTermCapability(filtered.taxonomy, "edit");
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

    // A new term starts from its fields' defaults (ADR 0026); the meta the
    // caller sends lands on top of them.
    const starting = startingMeta(
      listTermMetaFields(context.plugins, filtered.taxonomy),
    );

    // Validate meta up-front so a bad key fails before the term insert —
    // keeps the DB clean when the client sends a typo in a meta key.
    const metaPatch = await sanitizeMetaForRpc(
      context.plugins,
      filtered.taxonomy,
      filtered.meta,
      { stored: starting, auth: context.auth },
      errors,
    );
    if (metaPatch) {
      assertTermMetaCapabilities(
        context.plugins,
        filtered.taxonomy,
        metaPatch,
        context.auth,
        errors,
      );
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
          meta: starting,
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

    let meta: ResolvedMeta;
    if (metaPatch) {
      await writeTermMeta(context, created, metaPatch);
      meta = await loadTermMeta(context, created);
    } else {
      meta = await resolveTermMeta(context, created.taxonomy, created.meta);
    }

    await context.hooks.doAction("term:created", created, context);
    return context.hooks.applyFilter("rpc:term.create:output", {
      ...created,
      meta,
    });
  });
