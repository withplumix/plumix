import type { LookupResult } from "plumix/plugin";
import type { JsonObject } from "plumix/support";
import { and, count, eq, inArray, sql } from "plumix/db";
import {
  authenticated,
  base,
  listEntryMetaFields,
  listTermMetaFields,
  requireCapability,
  resolveCapability,
  startingMeta,
  termCapability,
} from "plumix/plugin";
import { entries, entryTerm, settings, terms } from "plumix/schema";
import { slugify } from "plumix/support";
import * as v from "valibot";

import type { ResolvedRow } from "./server/resolveItemStates.js";
import type { RegisteredMenuLocation } from "./server/types.js";
import { MenuPluginError } from "./errors.js";
import { getEligibleMenuKinds, isMenuEligible } from "./server/eligibility.js";
import { parseMenuItemMeta } from "./server/parseMeta.js";
import {
  lookupMenuTargets,
  resolveItemStates,
} from "./server/resolveItemStates.js";
import {
  flattenSaveItems,
  resolveParentIds,
  withTargetSnapshot,
} from "./server/save.js";
import { sanitizeMenuHref } from "./server/url.js";

const MENU_TAXONOMY = "menu";
const MENU_ITEM_ENTRY_TYPE = "menu_item";
const MENU_LOCATIONS_GROUP = "menu_locations";
const DEFAULT_MAX_DEPTH = 5;
const MAX_MAX_DEPTH = 20;
const MAX_ITEMS_PER_SAVE = 500;
const MAX_TITLE_LENGTH = 300;
const MAX_LOCATION_ID_LENGTH = 64;
const SEARCH_TARGETS_LIMIT = 20;
const MENU_LOCATION_ID_RE = /^[a-z][a-z0-9-]*$/;

// Valibot schemas for the wire-level inputs.

const idParam = v.pipe(v.number(), v.integer(), v.minValue(1));

const customMetaSchema = v.object({
  kind: v.literal("custom"),
  url: v.pipe(v.string(), v.minLength(1), v.maxLength(2048)),
  target: v.optional(v.literal("_blank")),
  rel: v.optional(v.pipe(v.string(), v.maxLength(255))),
  cssClasses: v.optional(
    v.pipe(v.array(v.pipe(v.string(), v.maxLength(64))), v.maxLength(32)),
  ),
});

const entryMetaSchema = v.object({
  kind: v.literal("entry"),
  entryId: idParam,
  target: v.optional(v.literal("_blank")),
  rel: v.optional(v.pipe(v.string(), v.maxLength(255))),
  cssClasses: v.optional(
    v.pipe(v.array(v.pipe(v.string(), v.maxLength(64))), v.maxLength(32)),
  ),
});

const termMetaSchema = v.object({
  kind: v.literal("term"),
  termId: idParam,
  target: v.optional(v.literal("_blank")),
  rel: v.optional(v.pipe(v.string(), v.maxLength(255))),
  cssClasses: v.optional(
    v.pipe(v.array(v.pipe(v.string(), v.maxLength(64))), v.maxLength(32)),
  ),
});

const itemMetaSchema = v.union([
  customMetaSchema,
  entryMetaSchema,
  termMetaSchema,
]);

const saveItemSchema = v.object({
  id: v.optional(idParam),
  parentIndex: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))),
  sortOrder: v.pipe(v.number(), v.integer(), v.minValue(0)),
  title: v.nullable(v.pipe(v.string(), v.maxLength(MAX_TITLE_LENGTH))),
  meta: itemMetaSchema,
});

const slugSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(200),
  v.regex(/^[a-z0-9][a-z0-9-]*$/),
);

const locationIdSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(MAX_LOCATION_ID_LENGTH),
  v.regex(MENU_LOCATION_ID_RE),
);

/**
 * Capability used for every mutating menu RPC. `registerTermTaxonomy`
 * auto-derives the taxonomy's `manage` at the editor tier; reusing it here
 * keeps the gate consistent with WP-style "manage taxonomy" semantics.
 */
export const MENU_MANAGE_CAPABILITY = termCapability("menu", "manage");

interface MenuListItem {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly version: number;
  readonly itemCount: number;
}

interface MenuGetResponse {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly version: number;
  readonly maxDepth: number;
  readonly items: readonly ResolvedRow[];
}

interface SaveResponse {
  readonly termId: number;
  readonly version: number;
  readonly itemIds: readonly number[];
  readonly added: readonly number[];
  readonly removed: readonly number[];
  readonly modified: readonly number[];
}

export function createMenuRouter(
  registered: ReadonlyMap<string, RegisteredMenuLocation>,
) {
  const list = base
    .use(authenticated)
    .use(requireCapability(MENU_MANAGE_CAPABILITY))
    .handler(async ({ context }): Promise<readonly MenuListItem[]> => {
      const rows = await context.db
        .select({
          id: terms.id,
          slug: terms.slug,
          name: terms.name,
          version: terms.version,
          itemCount: count(entryTerm.entryId),
        })
        .from(terms)
        .leftJoin(entryTerm, eq(entryTerm.termId, terms.id))
        .where(eq(terms.taxonomy, MENU_TAXONOMY))
        .groupBy(terms.id)
        .orderBy(terms.name);
      return rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        version: row.version,
        itemCount: row.itemCount,
      }));
    });

  const get = base
    .use(authenticated)
    .use(requireCapability(MENU_MANAGE_CAPABILITY))
    .input(v.object({ termId: idParam }))
    .handler(async ({ input, context, errors }): Promise<MenuGetResponse> => {
      const [term] = await context.db
        .select()
        .from(terms)
        .where(
          and(eq(terms.id, input.termId), eq(terms.taxonomy, MENU_TAXONOMY)),
        )
        .limit(1);
      if (!term) {
        throw errors.NOT_FOUND({ data: { kind: "menu", id: input.termId } });
      }
      const rows = await context.db
        .select({
          id: entries.id,
          parentId: entries.parentId,
          sortOrder: entries.sortOrder,
          title: entries.title,
          meta: entries.meta,
        })
        .from(entries)
        .where(
          and(
            eq(entries.type, MENU_ITEM_ENTRY_TYPE),
            inArray(
              entries.id,
              context.db
                .select({ id: entryTerm.entryId })
                .from(entryTerm)
                .where(eq(entryTerm.termId, term.id)),
            ),
          ),
        )
        .orderBy(entries.parentId, entries.sortOrder, entries.id);
      const items = await resolveItemStates(context, rows);
      return {
        id: term.id,
        slug: term.slug,
        name: term.name,
        version: term.version,
        maxDepth: readMaxDepth(term.meta),
        items,
      };
    });

  const save = base
    .use(authenticated)
    .use(requireCapability(MENU_MANAGE_CAPABILITY))
    .input(
      v.object({
        termId: idParam,
        version: v.pipe(v.number(), v.integer(), v.minValue(0)),
        maxDepth: v.optional(
          v.pipe(
            v.number(),
            v.integer(),
            v.minValue(1),
            v.maxValue(MAX_MAX_DEPTH),
          ),
        ),
        items: v.pipe(v.array(saveItemSchema), v.maxLength(MAX_ITEMS_PER_SAVE)),
      }),
    )
    .handler(async ({ input, context, errors }): Promise<SaveResponse> => {
      const [term] = await context.db
        .select()
        .from(terms)
        .where(
          and(eq(terms.id, input.termId), eq(terms.taxonomy, MENU_TAXONOMY)),
        )
        .limit(1);
      if (!term) {
        throw errors.NOT_FOUND({ data: { kind: "menu", id: input.termId } });
      }

      const maxDepth = input.maxDepth ?? readMaxDepth(term.meta);
      const flat = flattenSaveItems(input.items, { maxDepth });
      if (!flat.ok) {
        throw errors.CONFLICT({
          data: {
            reason: flat.error.kind,
            key: String(flat.error.index),
          },
        });
      }

      // Sanitize custom-URL items at save time — read-side sanitization
      // alone leaves hostile URLs persisted in `entries.meta` where
      // third-party renderers (admin previews, future plugins) might
      // surface them. Reject up front.
      for (let i = 0; i < input.items.length; i++) {
        const itemInput = input.items[i];
        if (
          itemInput?.meta.kind === "custom" &&
          sanitizeMenuHref(itemInput.meta.url) === null
        ) {
          throw errors.CONFLICT({
            data: { reason: "unsafe_url", key: String(i) },
          });
        }
      }

      // Look the linked items' targets up before the CAS bump below: a
      // lookup that throws then leaves the menu's version alone, so the
      // editor can retry the save.
      const targets = await lookupMenuTargets(
        context,
        flat.items.map((item) => item.meta),
      );

      // CAS bump: two concurrent saves can both pass the earlier version check;
      // only the first UPDATE matches, and the loser aborts before writing.
      const versionBumped = await context.db
        .update(terms)
        .set({ version: term.version + 1 })
        .where(and(eq(terms.id, term.id), eq(terms.version, input.version)))
        .returning({ id: terms.id });
      if (versionBumped.length === 0) {
        throw errors.CONFLICT({
          data: {
            reason: "version_mismatch",
            key: String(term.version),
          },
        });
      }

      // Reject claimed ids not linked to this menu, or a save could re-parent
      // another menu's items.
      const claimedIds = flat.items
        .map((item) => item.id)
        .filter((id): id is number => id !== null);
      const existingRows = await context.db
        .select({ id: entries.id, meta: entries.meta })
        .from(entries)
        .where(
          and(
            eq(entries.type, MENU_ITEM_ENTRY_TYPE),
            inArray(
              entries.id,
              context.db
                .select({ id: entryTerm.entryId })
                .from(entryTerm)
                .where(eq(entryTerm.termId, term.id)),
            ),
            claimedIds.length === 0
              ? sql`1 = 0`
              : inArray(entries.id, claimedIds),
          ),
        );
      const validClaimedIds = new Set(existingRows.map((r) => r.id));
      for (const id of claimedIds) {
        if (!validClaimedIds.has(id)) {
          throw errors.CONFLICT({
            data: {
              reason: "claimed_id_not_in_menu",
              key: String(id),
            },
          });
        }
      }

      // The snapshot keeps the editor showing the item after its target is
      // trashed; an unresolved target keeps the snapshot already stored.
      const storedMetas = new Map(
        existingRows.map((r) => [r.id, parseMenuItemMeta(r.meta)]),
      );
      const metas = flat.items.map((item) =>
        withTargetSnapshot(
          item.meta,
          targets,
          item.id === null ? null : (storedMetas.get(item.id) ?? null),
        ),
      );

      // Load the prior set so we can compute removed / modified ids
      // without a second query after the writes.
      const priorRows = await context.db
        .select({ id: entries.id })
        .from(entries)
        .where(
          and(
            eq(entries.type, MENU_ITEM_ENTRY_TYPE),
            inArray(
              entries.id,
              context.db
                .select({ id: entryTerm.entryId })
                .from(entryTerm)
                .where(eq(entryTerm.termId, term.id)),
            ),
          ),
        );
      const priorIds = new Set(priorRows.map((r) => r.id));

      // Reuse the editor's user as the items' author for new items.
      // Slice 7+ admin always saves with an authenticated editor; the
      // user's authorId is not user-visible on menu items.
      const authorId = context.user.id;

      // Slug uniqueness on entries is `(type, slug)` — across all
      // `menu_item` rows, slugs must be unique. Generate per-save with
      // termId + index suffix to avoid collisions across menus.
      const slugBase = `mi-t${term.id}-${Date.now()}-${cryptoRandom()}`;
      // A new item starts from the fields registered on `menu_item` (ADR
      // 0026); its own meta lands on top.
      const starting = startingMeta(
        listEntryMetaFields(context.plugins, MENU_ITEM_ENTRY_TYPE),
      );

      const itemIds: number[] = [];
      const added: number[] = [];
      const modified: number[] = [];

      // Serial, no transaction: D1 lacks BEGIN/COMMIT and libsql's opens a
      // separate connection. The version bump comes last, so a failed write
      // leaves a mismatch the next save sees.
      for (let i = 0; i < flat.items.length; i++) {
        const item = flat.items[i];
        if (!item) continue;

        if (item.id !== null) {
          const [updated] = await context.db
            .update(entries)
            .set({
              title: item.title ?? "",
              sortOrder: item.sortOrder,
              meta: metas[i],
              // parentId is patched in the second pass below.
            })
            .where(eq(entries.id, item.id))
            .returning({ id: entries.id });
          if (!updated) {
            throw errors.CONFLICT({
              data: { reason: "row_disappeared", key: String(item.id) },
            });
          }
          itemIds.push(item.id);
          modified.push(item.id);
        } else {
          const [inserted] = await context.db
            .insert(entries)
            .values({
              type: MENU_ITEM_ENTRY_TYPE,
              title: item.title ?? "",
              slug: `${slugBase}-${i}`,
              status: "published",
              authorId,
              sortOrder: item.sortOrder,
              meta: { ...starting, ...metas[i] },
            })
            .returning({ id: entries.id });
          if (!inserted) {
            throw errors.CONFLICT({ data: { reason: "insert_failed" } });
          }
          itemIds.push(inserted.id);
          added.push(inserted.id);
          // Junction row links this item to the menu term.
          await context.db.insert(entryTerm).values({
            entryId: inserted.id,
            termId: term.id,
            sortOrder: item.sortOrder,
          });
        }
      }

      // Second pass: patch parent_id now that every item has a
      // resolved id.
      const parentIds = resolveParentIds(flat.items, itemIds);
      for (let i = 0; i < itemIds.length; i++) {
        const id = itemIds[i];
        const parentId = parentIds[i] ?? null;
        if (id === undefined) continue;
        await context.db
          .update(entries)
          .set({ parentId })
          .where(eq(entries.id, id));
      }

      // Drop items present before but not in the new payload.
      const keptIds = new Set(itemIds);
      const removedIds = [...priorIds].filter((id) => !keptIds.has(id));
      if (removedIds.length > 0) {
        await context.db.delete(entries).where(inArray(entries.id, removedIds));
        // entry_term cascade deletes via FK on entries.id.
      }

      // Version was already bumped via CAS at the start of the save.

      // Reuse `removedIds` — `removed` in the response IS what we
      // deleted. Recomputing risks divergence after a refactor.
      const itemIdSet = new Set(itemIds);
      const removed = [...priorIds].filter((id) => !itemIdSet.has(id));

      // Fires even for no-op saves so cache invalidators needn't sniff the
      // payload. Subscriber failures don't roll back the commit.
      await context.hooks.doAction(
        "menu:saved",
        {
          termId: term.id,
          addedIds: added,
          removedIds: removed,
          modifiedIds: modified,
        },
        context,
      );

      return {
        termId: term.id,
        version: term.version + 1,
        itemIds,
        added,
        removed,
        modified,
      };
    });

  const remove = base
    .use(authenticated)
    .use(requireCapability(MENU_MANAGE_CAPABILITY))
    .input(v.object({ termId: idParam }))
    .handler(async ({ input, context, errors }) => {
      const [term] = await context.db
        .select()
        .from(terms)
        .where(
          and(eq(terms.id, input.termId), eq(terms.taxonomy, MENU_TAXONOMY)),
        )
        .limit(1);
      if (!term) {
        throw errors.NOT_FOUND({ data: { kind: "menu", id: input.termId } });
      }
      // Serial deletes (no transaction wrapper — see save handler note).
      // entry_term cascades on entries.id and terms.id, so deleting the
      // entries first then the term sweeps the junction rows
      // automatically.
      await context.db
        .delete(entries)
        .where(
          and(
            eq(entries.type, MENU_ITEM_ENTRY_TYPE),
            inArray(
              entries.id,
              context.db
                .select({ id: entryTerm.entryId })
                .from(entryTerm)
                .where(eq(entryTerm.termId, term.id)),
            ),
          ),
        );
      await context.db.delete(terms).where(eq(terms.id, term.id));
      // Leaving bindings to a deleted menu is a known WP pain point. The value
      // is stored as JSON, so compare against the JSON-encoded slug.
      const unbound = await context.db
        .delete(settings)
        .where(
          and(
            eq(settings.group, MENU_LOCATIONS_GROUP),
            eq(settings.value, term.slug),
          ),
        )
        .returning({ key: settings.key });
      await context.hooks.doAction(
        "menu:deleted",
        { termId: term.id, slug: term.slug },
        context,
      );
      if (unbound.length > 0) {
        await context.hooks.doAction(
          "settings:group_changed",
          {
            group: MENU_LOCATIONS_GROUP,
            set: {},
            removed: unbound.map((row) => row.key),
          },
          context,
        );
      }
      return { id: input.termId };
    });

  const create = base
    .use(authenticated)
    .use(requireCapability(MENU_MANAGE_CAPABILITY))
    .input(
      v.object({
        name: v.pipe(
          v.string(),
          v.transform((s) => s.trim()),
          v.minLength(1),
          v.maxLength(MAX_TITLE_LENGTH),
        ),
      }),
    )
    .handler(
      async ({
        input,
        context,
        errors,
      }): Promise<{
        readonly termId: number;
        readonly slug: string;
        readonly version: number;
      }> => {
        const baseSlug = slugify(input.name) || `menu-${cryptoRandom()}`;
        let slug = baseSlug;
        let attempt = 0;
        // Probe-then-insert keeps the typical case to one query and
        // resolves contention with a deterministic numeric suffix.
        while (true) {
          const [conflict] = await context.db
            .select({ id: terms.id })
            .from(terms)
            .where(and(eq(terms.taxonomy, MENU_TAXONOMY), eq(terms.slug, slug)))
            .limit(1);
          if (!conflict) break;
          attempt += 1;
          if (attempt > 50) {
            throw errors.CONFLICT({
              data: { reason: "slug_exhausted", key: baseSlug },
            });
          }
          slug = `${baseSlug}-${String(attempt + 1)}`;
        }
        const [row] = await context.db
          .insert(terms)
          .values({
            taxonomy: MENU_TAXONOMY,
            slug,
            name: input.name,
            // A new menu starts from the fields registered on the `menu`
            // taxonomy (ADR 0026).
            meta: startingMeta(
              listTermMetaFields(context.plugins, MENU_TAXONOMY),
            ),
          })
          .returning({ id: terms.id, version: terms.version });
        if (!row) {
          // `.returning()` after a successful INSERT is non-empty on SQLite/D1;
          // surface a driver regression rather than paper over it.
          throw MenuPluginError.menuCreateNoRowReturned();
        }
        return { termId: row.id, slug, version: row.version };
      },
    );

  const assignLocation = base
    .use(authenticated)
    .use(requireCapability(MENU_MANAGE_CAPABILITY))
    .input(
      v.object({
        location: locationIdSchema,
        termSlug: v.nullable(slugSchema),
      }),
    )
    .handler(async ({ input, context, errors }) => {
      // Reject typos: only locations a theme has registered are
      // assignable. Otherwise `assignLocation('primry', ...)` would
      // silently write a row that no consumer would ever read.
      if (!registered.has(input.location)) {
        throw errors.NOT_FOUND({
          data: { kind: "menu_location", id: input.location },
        });
      }
      if (input.termSlug !== null) {
        const [term] = await context.db
          .select({ id: terms.id })
          .from(terms)
          .where(
            and(
              eq(terms.taxonomy, MENU_TAXONOMY),
              eq(terms.slug, input.termSlug),
            ),
          )
          .limit(1);
        if (!term) {
          throw errors.NOT_FOUND({
            data: { kind: "menu", id: input.termSlug },
          });
        }
      }
      // Upsert: Drizzle's onConflictDoUpdate covers the (group, key)
      // composite-pk path. Null `termSlug` means "unbind this location"
      // — translated to a delete row so reads correctly return null.
      if (input.termSlug === null) {
        await context.db
          .delete(settings)
          .where(
            and(
              eq(settings.group, MENU_LOCATIONS_GROUP),
              eq(settings.key, input.location),
            ),
          );
      } else {
        await context.db
          .insert(settings)
          .values({
            group: MENU_LOCATIONS_GROUP,
            key: input.location,
            value: input.termSlug,
          })
          .onConflictDoUpdate({
            target: [settings.group, settings.key],
            set: { value: input.termSlug },
          });
      }
      // Pages that rendered this location are stored under the group's tag,
      // so core's settings listener purges them.
      await context.hooks.doAction(
        "settings:group_changed",
        input.termSlug === null
          ? { group: MENU_LOCATIONS_GROUP, set: {}, removed: [input.location] }
          : {
              group: MENU_LOCATIONS_GROUP,
              set: { [input.location]: input.termSlug },
              removed: [],
            },
        context,
      );
      return { location: input.location, termSlug: input.termSlug };
    });

  const pickerTabs = base
    .use(authenticated)
    .use(requireCapability(MENU_MANAGE_CAPABILITY))
    .handler(
      async ({
        context,
      }): Promise<
        readonly {
          readonly kind: string;
          readonly tabLabel: string;
          readonly target?: string;
        }[]
      > => {
        return Promise.resolve(getEligibleMenuKinds(context.plugins));
      },
    );

  const searchTargets = base
    .use(authenticated)
    .use(requireCapability(MENU_MANAGE_CAPABILITY))
    .input(
      v.object({
        kind: v.picklist(["entry", "term"]),
        target: v.string(),
        query: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200))),
      }),
    )
    .handler(
      async ({
        input,
        context,
        errors,
      }): Promise<{ readonly items: readonly LookupResult[] }> => {
        const eligible =
          input.kind === "entry"
            ? context.plugins.entryTypes.get(input.target)
            : context.plugins.termTaxonomies.get(input.target);
        if (!eligible || !isMenuEligible(eligible)) {
          throw errors.NOT_FOUND({
            data: { kind: "menu_target", id: input.target },
          });
        }
        // The same gate `lookup.list` applies, so the picker lists no more than
        // the viewer could look up directly.
        const registered = context.plugins.lookupAdapters.get(input.kind);
        if (!registered) return { items: [] };
        const { capability } = registered;
        if (capability !== null && !context.auth.can(capability)) {
          throw errors.FORBIDDEN({
            data: {
              capability: resolveCapability(context.plugins, capability),
            },
          });
        }
        const items = await registered.adapter.list(context, {
          query: input.query,
          scope:
            input.kind === "entry"
              ? { entryTypes: [input.target] }
              : { termTaxonomies: [input.target] },
          limit: SEARCH_TARGETS_LIMIT,
        });
        return { items };
      },
    );

  const locationsList = base
    .use(authenticated)
    .use(requireCapability(MENU_MANAGE_CAPABILITY))
    .handler(async ({ context }): Promise<readonly LocationRow[]> => {
      if (registered.size === 0) return [];

      // settings.value is JSON-encoded, so a SQL join on terms.slug would
      // compare `"main"` with `main`. Rows are bounded by registered locations.
      const settingRows = await context.db
        .select({ key: settings.key, value: settings.value })
        .from(settings)
        .where(
          and(
            eq(settings.group, MENU_LOCATIONS_GROUP),
            inArray(settings.key, [...registered.keys()]),
          ),
        );
      const slugToLocation = new Map<string, string>();
      for (const row of settingRows) {
        if (typeof row.value === "string")
          slugToLocation.set(row.value, row.key);
      }
      const bindings = new Map<string, number>();
      if (slugToLocation.size > 0) {
        const termRows = await context.db
          .select({ id: terms.id, slug: terms.slug })
          .from(terms)
          .where(
            and(
              eq(terms.taxonomy, MENU_TAXONOMY),
              inArray(terms.slug, [...slugToLocation.keys()]),
            ),
          );
        for (const row of termRows) {
          const locationId = slugToLocation.get(row.slug);
          if (locationId) bindings.set(locationId, row.id);
        }
      }

      return [...registered.values()]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((location) => {
          const result: LocationRow = {
            id: location.id,
            label: location.label,
            boundTermId: bindings.get(location.id) ?? null,
          };
          return location.description === undefined
            ? result
            : { ...result, description: location.description };
        });
    });

  return {
    list,
    get,
    save,
    create,
    delete: remove,
    assignLocation,
    pickerTabs,
    searchTargets,
    locations: { list: locationsList },
  };
}

/**
 * The admin chunk's wire contract, imported there with `import type` so this
 * module stays server-only.
 */
export type MenuRouter = ReturnType<typeof createMenuRouter>;

interface LocationRow {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly boundTermId: number | null;
}

function readMaxDepth(meta: JsonObject): number {
  const raw = meta.maxDepth;
  if (typeof raw !== "number" || !Number.isInteger(raw))
    return DEFAULT_MAX_DEPTH;
  if (raw < 1 || raw > MAX_MAX_DEPTH) return DEFAULT_MAX_DEPTH;
  return raw;
}

function cryptoRandom(): string {
  // Non-cryptographic: a collision fails the unique index and the editor gets a
  // retryable error.
  return Math.random().toString(36).slice(2, 10);
}
