import type { AuthenticatedAppContext } from "../../../context/app-context.js";
import type { NewEntry } from "../../../db/schema/entries.js";
import type { JsonValue } from "../../../json.js";
import type { ResolvedMeta } from "../../../meta/contract/bags.js";
import type { EntryCreate, EntryWritten } from "./writes-shared.js";
import {
  entryCapabilityNamespace,
  namespacedEntryCapability,
} from "../../../access/contract/entry-capabilities.js";
import { etagOf } from "../../../db/concurrency.js";
import { entries } from "../../../db/schema/entries.js";
import { isAuthoredEntryType } from "../../../entries/authored.js";
import {
  applyTermPatch,
  assertTermsPatchValid,
  buildTermsPatchGuards,
} from "../../../entries/terms.js";
import { loadReadableParent } from "../../../entries/visibility.js";
import { isEmptyMetaPatch, patchedMetaBag } from "../../../meta/core.js";
import {
  announceEntryMetaChange,
  assertPromotedEntryMetaValid,
  resolveEntryMeta,
  sanitizeAndValidateEntryMeta,
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
import { writeErrors as errors, withStoredMeta } from "./writes-shared.js";

export const create = base
  .use(authenticated)
  .input(entryCreateInputSchema)
  .handler(async ({ input, context }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:entry.create:input",
      input,
    );

    const written = await createEntry(context, filtered, () => {
      const namespace = entryCapabilityNamespace(
        context.plugins,
        filtered.type,
      );
      const createCapability = namespacedEntryCapability(namespace, "create");
      if (!context.auth.can(createCapability)) {
        throw errors.FORBIDDEN({ data: { capability: createCapability } });
      }

      if (createGoesLive(filtered.status)) {
        const publishCapability = namespacedEntryCapability(
          namespace,
          "publish",
        );
        if (!context.auth.can(publishCapability)) {
          throw errors.FORBIDDEN({ data: { capability: publishCapability } });
        }
      }
    });
    const output = await context.hooks.applyFilter("rpc:entry.create:output", {
      ...written.entry,
      meta: written.meta,
    });
    return { ...output, etag: written.etag };
  });

function createGoesLive(status: EntryCreate["status"]): boolean {
  return status === "published" || status === "scheduled";
}

/**
 * `entry.create` and `ctx.entries.create`; `gate` is the procedure's capability
 * check, run once the type is known to be an authored one.
 */
export async function createEntry(
  context: AuthenticatedAppContext,
  filtered: EntryCreate,
  gate?: () => void,
): Promise<EntryWritten> {
  // Reserved internal types (revision, autosave) are written only by
  // the framework's snapshot / draft paths — reject here so a hostile
  // input.type can't smuggle reserved rows into the table.
  if (!isAuthoredEntryType(filtered.type)) {
    throw errors.BAD_REQUEST({ data: { reason: "reserved_type" } });
  }
  gate?.();

  const goesLive = createGoesLive(filtered.status);
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
  assertContentValidAgainstRegistries(filtered.content, [], context, errors);

  // A new entry starts from its fields' defaults (ADR 0026); the meta the
  // caller sends lands on top of them.
  const starting = startingMeta(
    listEntryMetaFields(context.plugins, filtered.type),
  );

  // Validated before the insert so a bad key leaves no row. Drafts are
  // lenient; creating published or scheduled enforces business rules now.
  let metaPatch = await sanitizeAndValidateEntryMeta(
    context,
    filtered.type,
    filtered.meta,
    starting,
    errors,
    goesLive ? "strict" : "draft",
  );
  // Creating onto the live surface is a publish, so it takes the whole-bag
  // gate: the patch check judged only the keys sent, and a required field it
  // omits is missing.
  if (goesLive) {
    const resultingMeta: Record<string, JsonValue> = { ...starting };
    if (metaPatch) {
      for (const [key, value] of metaPatch.upserts) resultingMeta[key] = value;
      for (const key of metaPatch.deletes) delete resultingMeta[key];
    }
    await assertPromotedEntryMetaValid(
      context,
      filtered.type,
      resultingMeta,
      errors,
    );
  }

  metaPatch = withStoredMeta(metaPatch, filtered.storedMeta);

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
  // In the insert, not a second write after it, so the row answers with the
  // token the caller's first save will send.
  if (metaPatch) prepared.meta = patchedMetaBag(prepared.meta, metaPatch);

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

  if (metaPatch && !isEmptyMetaPatch(metaPatch)) {
    await announceEntryMetaChange(context, created, metaPatch);
  }
  const meta: ResolvedMeta = await resolveEntryMeta(
    context,
    created,
    created.meta,
  );

  await fireEntryTransition(context, created, "draft");
  if (created.status === "published") {
    await fireEntryPublished(context, created);
  }

  return { entry: created, meta, etag: etagOf(created.updatedAt) };
}
