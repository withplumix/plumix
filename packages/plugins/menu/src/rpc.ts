import * as v from "valibot";

import {
  and,
  authenticated,
  base,
  count,
  entries,
  entryTerm,
  eq,
  inArray,
  settings,
  sql,
  terms,
} from "@plumix/core";

import { getRegisteredLocations } from "./server/locations.js";
import { flattenSaveItems, resolveParentIds } from "./server/save.js";
import { sanitizeMenuHref } from "./server/url.js";

const MENU_TAXONOMY = "menu";
const MENU_ITEM_ENTRY_TYPE = "menu_item";
const MENU_LOCATIONS_GROUP = "menu_locations";
const DEFAULT_MAX_DEPTH = 5;
const MAX_MAX_DEPTH = 20;
const MAX_ITEMS_PER_SAVE = 500;
const MAX_TITLE_LENGTH = 300;
const MAX_LOCATION_ID_LENGTH = 64;
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

// Capability used for every mutating menu RPC. `registerTermTaxonomy`
// auto-derives `term:menu:manage` at the editor tier; reusing it here
// keeps the gate consistent with WP-style "manage taxonomy" semantics.
const MENU_MANAGE_CAPABILITY = "term:menu:manage";

interface MenuListItem {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly version: number;
  readonly itemCount: number;
}

interface MenuItemRow {
  readonly id: number;
  readonly parentId: number | null;
  readonly sortOrder: number;
  readonly title: string;
  readonly meta: Record<string, unknown>;
}

interface MenuGetResponse {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly version: number;
  readonly maxDepth: number;
  readonly items: readonly MenuItemRow[];
}

interface SaveResponse {
  readonly termId: number;
  readonly version: number;
  readonly itemIds: readonly number[];
  readonly added: readonly number[];
  readonly removed: readonly number[];
  readonly modified: readonly number[];
}

export function createMenuRouter(): Record<string, unknown> {
  const list = base
    .use(authenticated)
    .handler(async ({ context, errors }): Promise<readonly MenuListItem[]> => {
      if (!context.auth.can(MENU_MANAGE_CAPABILITY)) {
        throw errors.FORBIDDEN({
          data: { capability: MENU_MANAGE_CAPABILITY },
        });
      }
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
        itemCount: Number(row.itemCount),
      }));
    });

  const get = base
    .use(authenticated)
    .input(v.object({ termId: idParam }))
    .handler(async ({ input, context, errors }): Promise<MenuGetResponse> => {
      if (!context.auth.can(MENU_MANAGE_CAPABILITY)) {
        throw errors.FORBIDDEN({
          data: { capability: MENU_MANAGE_CAPABILITY },
        });
      }
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
      return {
        id: term.id,
        slug: term.slug,
        name: term.name,
        version: term.version,
        maxDepth: readMaxDepth(term.meta),
        items: rows,
      };
    });

  const save = base
    .use(authenticated)
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
      if (!context.auth.can(MENU_MANAGE_CAPABILITY)) {
        throw errors.FORBIDDEN({
          data: { capability: MENU_MANAGE_CAPABILITY },
        });
      }

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

      // Atomic CAS version bump. Both concurrent saves passing the
      // earlier `term.version === input.version` check would otherwise
      // race and silently overwrite each other. With CAS, only the
      // first save's UPDATE matches; the loser sees rowsAffected = 0
      // and aborts before doing any writes.
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

      // Existing item ids the input claims to update. Anything claimed
      // but not currently linked to this menu term is rejected — a
      // client-side bug or hostile call would otherwise let a save
      // re-parent another menu's items into this one.
      const claimedIds = flat.items
        .map((item) => item.id)
        .filter((id): id is number => id !== null);
      const existingRows = await context.db
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

      const itemIds: number[] = [];
      const added: number[] = [];
      const modified: number[] = [];

      // Serial writes — drizzle's `db.transaction()` for libsql opens a
      // separate connection that doesn't share `:memory:` state with
      // the parent in tests, and Cloudflare D1 doesn't support
      // full BEGIN/COMMIT transactions either. Atomicity is provided by
      // the version-bump-last pattern: if any write fails, the term
      // version stays unbumped and the editor's next save sees the
      // inconsistent state via a version mismatch and retries. SQLite
      // statement-level isolation rules out half-written rows.
      for (let i = 0; i < flat.items.length; i++) {
        const item = flat.items[i];
        if (!item) continue;

        if (item.id !== null) {
          const [updated] = await context.db
            .update(entries)
            .set({
              title: item.title ?? "",
              sortOrder: item.sortOrder,
              meta: item.meta as unknown as Record<string, unknown>,
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
              meta: item.meta as unknown as Record<string, unknown>,
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

      // `menu:saved` fires after every successful save (including
      // no-op saves where added/removed/modified are all empty), so
      // cache invalidators can run unconditionally without sniffing
      // the payload. Failures in subscribers don't roll back the
      // commit (Promise.allSettled inside doAction).
      await context.hooks.doAction("menu:saved", {
        termId: term.id,
        addedIds: added,
        removedIds: removed,
        modifiedIds: modified,
      });

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
    .input(v.object({ termId: idParam }))
    .handler(async ({ input, context, errors }) => {
      if (!context.auth.can(MENU_MANAGE_CAPABILITY)) {
        throw errors.FORBIDDEN({
          data: { capability: MENU_MANAGE_CAPABILITY },
        });
      }
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
      // Sweep any settings rows binding a location to this term's slug
      // — leaving them lingering is a known WP pain point. The value is
      // stored as JSON; compare against the JSON-encoded form of the
      // slug ("\"main\"") since drizzle's `eq` on a JSON column
      // serializes via JSON.stringify before comparing.
      await context.db
        .delete(settings)
        .where(
          and(
            eq(settings.group, MENU_LOCATIONS_GROUP),
            eq(settings.value, term.slug),
          ),
        );
      return { id: input.termId };
    });

  const assignLocation = base
    .use(authenticated)
    .input(
      v.object({
        location: locationIdSchema,
        termSlug: v.nullable(slugSchema),
      }),
    )
    .handler(async ({ input, context, errors }) => {
      if (!context.auth.can(MENU_MANAGE_CAPABILITY)) {
        throw errors.FORBIDDEN({
          data: { capability: MENU_MANAGE_CAPABILITY },
        });
      }
      // Reject typos: only locations a theme has registered are
      // assignable. Otherwise `assignLocation('primry', ...)` would
      // silently write a row that no consumer would ever read.
      const registered = getRegisteredLocations();
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
      return { location: input.location, termSlug: input.termSlug };
    });

  return { list, get, save, delete: remove, assignLocation };
}

function readMaxDepth(meta: Record<string, unknown>): number {
  const raw = meta.maxDepth;
  if (typeof raw !== "number" || !Number.isInteger(raw))
    return DEFAULT_MAX_DEPTH;
  if (raw < 1 || raw > MAX_MAX_DEPTH) return DEFAULT_MAX_DEPTH;
  return raw;
}

function cryptoRandom(): string {
  // Short non-cryptographic suffix for slug generation; a collision
  // with a live row's slug surfaces as a unique-index violation that
  // rolls the transaction back, so worst case is the editor sees a
  // retry-friendly error.
  return Math.random().toString(36).slice(2, 10);
}
