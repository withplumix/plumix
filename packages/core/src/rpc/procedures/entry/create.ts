import type { NewEntry } from "../../../db/schema/entries.js";
import { entries } from "../../../db/schema/entries.js";
import { isReservedType } from "../../../revisions/slug-codec.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import {
  assertContentValidAgainstRegistries,
  assertContentWithinByteCap,
} from "./content.js";
import {
  applyEntryBeforeSave,
  entryCapability,
  fireEntryPublished,
  fireEntryTransition,
  loadReadableParent,
} from "./lifecycle.js";
import {
  assertEntryMetaCapabilities,
  decodeMetaBag,
  loadEntryMeta,
  sanitizeMetaForRpc,
  validateEntryMetaReferences,
  writeEntryMeta,
} from "./meta.js";
import { scheduledDateInvalid } from "./publish-scheduled.js";
import { entryCreateInputSchema } from "./schemas.js";
import {
  applyTermPatch,
  assertTermsPatchValid,
  buildTermsPatchGuards,
} from "./terms.js";

export const create = base
  .use(authenticated)
  .input(entryCreateInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:entry.create:input",
      input,
    );

    // Reserved internal types (revision, autosave) are written only by
    // the framework's snapshot / draft paths — reject here so a hostile
    // input.type can't smuggle reserved rows into the table.
    if (isReservedType(filtered.type)) {
      throw errors.BAD_REQUEST({ data: { reason: "reserved_type" } });
    }

    const createCapability = entryCapability(filtered.type, "create");
    if (!context.auth.can(createCapability)) {
      throw errors.FORBIDDEN({ data: { capability: createCapability } });
    }

    const requiresPublishCap =
      filtered.status === "published" || filtered.status === "scheduled";
    if (requiresPublishCap) {
      const publishCapability = entryCapability(filtered.type, "publish");
      if (!context.auth.can(publishCapability)) {
        throw errors.FORBIDDEN({ data: { capability: publishCapability } });
      }
    }

    if (scheduledDateInvalid(filtered.status, filtered.publishedAt)) {
      throw errors.BAD_REQUEST({
        data: { reason: "scheduled_requires_future_date" },
      });
    }

    if (filtered.parentId != null) {
      const parent = await loadReadableParent(
        context,
        filtered.type,
        filtered.parentId,
      );
      if (!parent) {
        throw errors.NOT_FOUND({
          data: { kind: "entry", id: filtered.parentId },
        });
      }
    }

    assertContentWithinByteCap(filtered.content, errors);
    assertContentValidAgainstRegistries(
      filtered.content,
      { blocks: context.blocks },
      errors,
    );

    // Validate meta up-front so a bad key fails before the entry insert —
    // keeps the DB clean when the client sends a typo in a meta key.
    const metaPatch = sanitizeMetaForRpc(
      context.plugins,
      filtered.type,
      filtered.meta,
      errors,
    );
    if (metaPatch) {
      assertEntryMetaCapabilities(
        context.plugins,
        filtered.type,
        metaPatch,
        context.auth,
        errors,
      );
      await validateEntryMetaReferences(
        context,
        filtered.type,
        metaPatch,
        errors,
      );
    }

    // Same up-front validation: a bad term reference shouldn't leave a
    // half-created entry behind.
    const termsPatch = filtered.terms;
    if (termsPatch !== undefined) {
      await assertTermsPatchValid(
        context,
        termsPatch,
        buildTermsPatchGuards(errors),
      );
    }

    // `published` goes live now; `scheduled` carries its future target time;
    // anything else has no publish time.
    let publishedAt: Date | null = null;
    if (filtered.status === "published") {
      publishedAt = new Date();
    } else if (filtered.status === "scheduled") {
      publishedAt = filtered.publishedAt ?? null;
    }

    const candidate: NewEntry = {
      type: filtered.type,
      title: filtered.title,
      slug: filtered.slug,
      content: filtered.content ?? null,
      excerpt: filtered.excerpt ?? null,
      status: filtered.status,
      parentId: filtered.parentId ?? null,
      sortOrder: filtered.sortOrder,
      authorId: context.user.id,
      publishedAt,
    };

    const prepared = await applyEntryBeforeSave(
      context,
      filtered.type,
      candidate,
    );
    prepared.authorId = context.user.id;
    prepared.type = filtered.type;

    const [created] = await context.db
      .insert(entries)
      .values(prepared)
      .onConflictDoNothing({ target: [entries.type, entries.slug] })
      .returning();

    if (!created) {
      throw errors.CONFLICT({ data: { reason: "slug_taken" } });
    }

    if (termsPatch !== undefined) {
      await applyTermPatch(context, created.id, termsPatch);
    }

    let meta: Record<string, unknown>;
    if (metaPatch) {
      await writeEntryMeta(context, created, metaPatch);
      meta = await loadEntryMeta(context, created);
    } else {
      // No write path — `created.meta` is the default `{}`. Decode inline
      // to save the round trip.
      meta = decodeMetaBag(context.plugins, created, created.meta);
    }

    await fireEntryTransition(context, created, "draft");
    if (created.status === "published") {
      await fireEntryPublished(context, created);
    }

    return context.hooks.applyFilter("rpc:entry.create:output", {
      ...created,
      meta,
    });
  });
