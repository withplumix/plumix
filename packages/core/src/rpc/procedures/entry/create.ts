import type { NewEntry } from "../../../db/schema/entries.js";
import type { JsonValue } from "../../../json.js";
import type { ResolvedMeta } from "../../../meta/contract/bags.js";
import {
  entryCapabilityNamespace,
  namespacedEntryCapability,
} from "../../../access/contract/entry-capabilities.js";
import { entries } from "../../../db/schema/entries.js";
import { isAuthoredEntryType } from "../../../entries/authored.js";
import {
  applyTermPatch,
  assertTermsPatchValid,
  buildTermsPatchGuards,
} from "../../../entries/terms.js";
import { loadReadableParent } from "../../../entries/visibility.js";
import {
  assertPromotedEntryMetaValid,
  loadEntryMeta,
  resolveEntryMeta,
  sanitizeAndValidateEntryMeta,
  writeEntryMeta,
} from "../../../meta/entry.js";
import { startingMeta } from "../../../plugin/fields/starting-meta.js";
import { listEntryMetaFields } from "../../../plugin/manifest.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import {
  assertContentValidAgainstRegistries,
  assertContentWithinByteCap,
} from "./content.js";
import {
  applyEntryBeforeSave,
  fireEntryPublished,
  fireEntryTransition,
} from "./lifecycle.js";
import { scheduledDateInvalid } from "./publish-scheduled.js";
import { entryCreateInputSchema } from "./schemas.js";

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
    if (!isAuthoredEntryType(filtered.type)) {
      throw errors.BAD_REQUEST({ data: { reason: "reserved_type" } });
    }

    const namespace = entryCapabilityNamespace(context.plugins, filtered.type);
    const createCapability = namespacedEntryCapability(namespace, "create");
    if (!context.auth.can(createCapability)) {
      throw errors.FORBIDDEN({ data: { capability: createCapability } });
    }

    const requiresPublishCap =
      filtered.status === "published" || filtered.status === "scheduled";
    if (requiresPublishCap) {
      const publishCapability = namespacedEntryCapability(namespace, "publish");
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

    // A new entry starts from its fields' defaults (ADR 0026); the meta the
    // caller sends lands on top of them.
    const starting = startingMeta(
      listEntryMetaFields(context.plugins, filtered.type),
    );

    // Validate meta up-front so a bad key fails before the entry insert —
    // keeps the DB clean when the client sends a typo in a meta key.
    // Creating a draft is lenient (business rules deferred to publish);
    // creating straight to published/scheduled enforces them now.
    const metaPatch = await sanitizeAndValidateEntryMeta(
      context,
      filtered.type,
      filtered.meta,
      starting,
      errors,
      requiresPublishCap ? "strict" : "draft",
    );
    // Creating onto the live surface is the same crossing as publishing a
    // draft, so it answers to the same whole-bag gate: the patch above judged
    // only the keys it was sent and the fields they switch on, and a required
    // field it omits is missing.
    if (requiresPublishCap) {
      const resultingMeta: Record<string, JsonValue> = { ...starting };
      if (metaPatch) {
        for (const [key, value] of metaPatch.upserts)
          resultingMeta[key] = value;
        for (const key of metaPatch.deletes) delete resultingMeta[key];
      }
      await assertPromotedEntryMetaValid(
        context,
        filtered.type,
        resultingMeta,
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
      // Untitled drafts store "" (the column is NOT NULL); read surfaces
      // render their own localized fallback for the empty title.
      title: filtered.title ?? "",
      slug: filtered.slug,
      content: filtered.content ?? null,
      excerpt: filtered.excerpt ?? null,
      status: filtered.status,
      parentId: filtered.parentId ?? null,
      sortOrder: filtered.sortOrder,
      authorId: context.user.id,
      publishedAt,
      meta: starting,
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

    let meta: ResolvedMeta;
    if (metaPatch) {
      await writeEntryMeta(context, created, metaPatch);
      meta = await loadEntryMeta(context, created);
    } else {
      // No write path — `created.meta` is the starting meta. Decode inline
      // to save the round trip.
      meta = await resolveEntryMeta(context, created, created.meta);
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
