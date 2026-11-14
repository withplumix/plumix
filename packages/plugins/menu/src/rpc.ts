import type { LeaseClaimant, LeaseResource } from "plumix/db";
import type {
  AppContext,
  AuthenticatedAppContext,
  LookupResult,
} from "plumix/plugin";
import {
  acquireEditLease,
  and,
  assertTermCopyCurrent,
  assertWritable,
  claimTerm,
  count,
  eq,
  etagOf,
  inArray,
  releaseEditLease,
  renewEditLease,
  takeOverEditLease,
  versionIfMatchObject,
} from "plumix/db";
import {
  authenticated,
  base,
  requireCapability,
  resolveCapability,
  termCapability,
} from "plumix/plugin";
import { entries, entryTerm, settings, terms } from "plumix/schema";
import { now, slugify } from "plumix/support";
import * as v from "valibot";

import type { MenuDepthLimit } from "./server/depth.js";
import type { ResolvedRow } from "./server/resolveItemStates.js";
import type { RegisteredMenuLocation } from "./server/types.js";
import { MENU_DEPTH_HARD_CAP, menuDepthLimit } from "./server/depth.js";
import { getEligibleMenuKinds, isMenuEligible } from "./server/eligibility.js";
import { menu } from "./server/events.js";
import { MENU_TAXONOMY } from "./server/getMenuByName.js";
import { parseMenuItemMeta } from "./server/parseMeta.js";
import {
  lookupMenuTargets,
  resolveItemStates,
} from "./server/resolveItemStates.js";
import {
  flattenSaveItems,
  hasNewNestingPastLimit,
  storedMetaChanges,
  withTargetSnapshot,
} from "./server/save.js";
import { sanitizeMenuHref } from "./server/url.js";

const MENU_ITEM_ENTRY_TYPE = "menu_item";
const MENU_LOCATIONS_GROUP = "menu_locations";
const MAX_ITEMS_PER_SAVE = 500;
const MAX_TITLE_LENGTH = 300;
const MAX_LOCATION_ID_LENGTH = 64;
const SEARCH_TARGETS_LIMIT = 20;
const MENU_LOCATION_ID_RE = /^[a-z][a-z0-9-]*$/;
const MENU_IF_MATCH_MESSAGE =
  "Send the menu's `etag` from `menu.get` as `ifMatch`";

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
 * auto-derives the taxonomy's `manage` for the editor role; reusing it here
 * keeps the gate consistent with WP-style "manage taxonomy" semantics.
 */
export const MENU_MANAGE_CAPABILITY = termCapability("menu", "manage");

interface MenuListItem {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly etag: string;
  readonly itemCount: number;
}

interface MenuGetResponse extends MenuDepthLimit {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly etag: string;
  readonly items: readonly ResolvedRow[];
}

interface SaveResponse {
  readonly termId: number;
  readonly etag: string;
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
        etag: etagOf(row.version),
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
      const limit = await depthLimitFor(context, registered, term.slug);
      return {
        id: term.id,
        slug: term.slug,
        name: term.name,
        etag: etagOf(term.version),
        maxDepth: limit.maxDepth,
        limitedBy: limit.limitedBy,
        items,
      };
    });

  const save = base
    .use(authenticated)
    .use(requireCapability(MENU_MANAGE_CAPABILITY))
    .input(
      versionIfMatchObject(
        {
          termId: idParam,
          items: v.pipe(
            v.array(saveItemSchema),
            v.maxLength(MAX_ITEMS_PER_SAVE),
          ),
          takeOver: v.optional(v.boolean()),
        },
        MENU_IF_MATCH_MESSAGE,
      ),
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
      await assertWritable(
        context.db,
        { kind: "term", id: term.id },
        claimantOf(context),
        { takeOver: input.takeOver },
      );
      assertTermCopyCurrent(input.ifMatch, term);

      const flat = flattenSaveItems(input.items, {
        maxDepth: MENU_DEPTH_HARD_CAP,
      });
      if (!flat.ok) {
        throw errors.CONFLICT({
          data: {
            reason: flat.error.kind,
            key: String(flat.error.index),
          },
        });
      }

      const priorRows = await context.db
        .select({
          id: entries.id,
          parentId: entries.parentId,
          sortOrder: entries.sortOrder,
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
        );
      // A lowered limit never locks editors out: only nesting this save adds
      // is held to it.
      const limit = await depthLimitFor(context, registered, term.slug);
      if (hasNewNestingPastLimit(flat.items, priorRows, limit.maxDepth)) {
        throw errors.CONFLICT({
          data: {
            reason: "max_depth_exceeded",
            ...(limit.limitedBy.length > 0
              ? { key: limit.limitedBy.join(",") }
              : {}),
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

      // Look the linked items' targets up, and check the claimed ids, before
      // the claim below: a refusal then leaves the menu's token alone, so the
      // editor can retry the save.
      const targets = await lookupMenuTargets(
        context,
        flat.items.map((item) => item.meta),
      );

      // Reject claimed ids not linked to this menu, or a save could re-parent
      // another menu's items.
      const claimedIds = flat.items
        .map((item) => item.id)
        .filter((id): id is number => id !== null);
      const existingRows =
        claimedIds.length === 0
          ? []
          : await context.db
              .select({
                id: entries.id,
                title: entries.title,
                sortOrder: entries.sortOrder,
                parentId: entries.parentId,
                meta: entries.meta,
                updatedAt: entries.updatedAt,
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
                  inArray(entries.id, claimedIds),
                ),
              );
      const storedRows = new Map(existingRows.map((r) => [r.id, r]));
      for (const id of claimedIds) {
        if (!storedRows.has(id)) {
          throw errors.CONFLICT({
            data: {
              reason: "claimed_id_not_in_menu",
              key: String(id),
            },
          });
        }
      }

      // Claimed first, so of two saves from one copy only the first writes.
      // Not a term update: no term column changes; the item writes purge.
      const claimed = await claimTerm(context.db, term.id, input.ifMatch, {});
      if (!claimed) {
        throw errors.NOT_FOUND({ data: { kind: "menu", id: term.id } });
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

      const priorIds = new Set(priorRows.map((r) => r.id));

      // Slug uniqueness on entries is `(type, slug)` — across all
      // `menu_item` rows, slugs must be unique. Generate per-save with
      // termId + index suffix to avoid collisions across menus.
      const slugBase = `mi-t${term.id}-${now().getTime()}-${cryptoRandom()}`;

      const itemIds: number[] = [];
      const added: number[] = [];
      const modified: number[] = [];

      // Serial: D1 lacks BEGIN/COMMIT. The claim above moved the token, so a
      // stale copy conflicts. A parent precedes its children in the payload.
      for (let i = 0; i < flat.items.length; i++) {
        const item = flat.items[i];
        const meta = metas[i];
        if (!item || !meta) continue;
        const title = item.title ?? "";
        const parentId =
          item.resolvedParentIndex === null
            ? null
            : (itemIds[item.resolvedParentIndex] ?? null);

        const stored = item.id === null ? undefined : storedRows.get(item.id);
        if (stored) {
          const storedMeta = storedMetaChanges(
            storedMetas.get(stored.id) ?? null,
            meta,
          );
          const changes = {
            ...(title === stored.title ? {} : { title }),
            ...(item.sortOrder === stored.sortOrder
              ? {}
              : { sortOrder: item.sortOrder }),
            ...(parentId === stored.parentId ? {} : { parentId }),
            ...(storedMeta === undefined ? {} : { storedMeta }),
          };
          if (Object.keys(changes).length > 0) {
            await context.entries.update({
              id: stored.id,
              ifMatch: stored.updatedAt,
              ...changes,
            });
          }
          itemIds.push(stored.id);
          modified.push(stored.id);
        } else {
          const { entry: inserted } = await context.entries.create({
            type: MENU_ITEM_ENTRY_TYPE,
            title,
            slug: `${slugBase}-${String(i)}`,
            status: "published",
            sortOrder: item.sortOrder,
            parentId,
            storedMeta: storedMetaChanges(null, meta),
          });
          await context.terms.assign({
            entryId: inserted.id,
            termId: term.id,
          });
          itemIds.push(inserted.id);
          added.push(inserted.id);
        }
      }

      const keptIds = new Set(itemIds);
      const removed = [...priorIds].filter((id) => !keptIds.has(id));
      for (const id of removed) {
        await context.entries.delete(id);
      }

      await context.events.emit(menu.saved, {
        termId: term.id,
        addedIds: added,
        removedIds: removed,
        modifiedIds: modified,
      });

      return {
        termId: term.id,
        etag: etagOf(claimed.version),
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
      const items = await context.db
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
      for (const item of items) {
        await context.entries.delete(item.id);
      }
      await context.terms.delete(term.id);
      // Leaving bindings to a deleted menu is a known WP pain point.
      await context.settings.removeValue(MENU_LOCATIONS_GROUP, term.slug);
      await context.events.emit(menu.deleted, {
        termId: term.id,
        slug: term.slug,
      });
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
        readonly etag: string;
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
        const { term: created, etag } = await context.terms.create({
          taxonomy: MENU_TAXONOMY,
          slug,
          name: input.name,
        });
        return { termId: created.id, slug, etag };
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
      await context.settings.write(MENU_LOCATIONS_GROUP, {
        [input.location]: input.termSlug,
      });
      return { location: input.location, termSlug: input.termSlug };
    });

  const leaseAcquire = base
    .use(authenticated)
    .use(requireCapability(MENU_MANAGE_CAPABILITY))
    .input(v.object({ id: idParam, takeOver: v.optional(v.boolean()) }))
    .handler(async ({ input, context, errors }) => {
      const resource = await menuResource(context, input.id);
      if (!resource) {
        throw errors.NOT_FOUND({ data: { kind: "menu", id: input.id } });
      }
      return input.takeOver === true
        ? takeOverEditLease(context.db, resource, claimantOf(context))
        : acquireEditLease(context.db, resource, claimantOf(context));
    });

  const leaseRenew = base
    .use(authenticated)
    .use(requireCapability(MENU_MANAGE_CAPABILITY))
    .input(v.object({ id: idParam }))
    .handler(async ({ input, context, errors }) => {
      const resource = await menuResource(context, input.id);
      if (!resource) {
        throw errors.NOT_FOUND({ data: { kind: "menu", id: input.id } });
      }
      return renewEditLease(context.db, resource, claimantOf(context));
    });

  // Best-effort: a tab that closes without it lets the lease lapse.
  const leaseRelease = base
    .use(authenticated)
    .use(requireCapability(MENU_MANAGE_CAPABILITY))
    .input(v.object({ id: idParam }))
    .handler(async ({ input, context }) => {
      await releaseEditLease(
        context.db,
        { kind: "term", id: input.id },
        context.user.id,
      );
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
          return {
            id: location.id,
            label: location.label,
            ...(location.description === undefined
              ? {}
              : { description: location.description }),
            ...(location.maxDepth === undefined
              ? {}
              : { maxDepth: location.maxDepth }),
            boundTermId: bindings.get(location.id) ?? null,
          };
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
    lease: { acquire: leaseAcquire, renew: leaseRenew, release: leaseRelease },
  };
}

/**
 * A menu is a term, so its lease is the term's: the menu editor and the term
 * editor never hold it apart.
 */
async function menuResource(
  context: AppContext,
  termId: number,
): Promise<LeaseResource | undefined> {
  const [term] = await context.db
    .select({ id: terms.id })
    .from(terms)
    .where(and(eq(terms.id, termId), eq(terms.taxonomy, MENU_TAXONOMY)))
    .limit(1);
  return term ? { kind: "term", id: term.id } : undefined;
}

/** A session is the admin's; an API token is a client calling RPC itself. */
function claimantOf(context: AuthenticatedAppContext): LeaseClaimant {
  return {
    userId: context.user.id,
    surface: context.tokenScopes === null ? "admin" : "rpc",
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
  readonly maxDepth?: number;
  readonly boundTermId: number | null;
}

async function depthLimitFor(
  context: AppContext,
  registered: ReadonlyMap<string, RegisteredMenuLocation>,
  slug: string,
): Promise<MenuDepthLimit> {
  // The value is stored as JSON, so compare against the JSON-encoded slug.
  const bindings = await context.db
    .select({ key: settings.key })
    .from(settings)
    .where(
      and(eq(settings.group, MENU_LOCATIONS_GROUP), eq(settings.value, slug)),
    );
  const assigned = bindings
    .map((row) => registered.get(row.key))
    .filter((location) => location !== undefined)
    .sort((a, b) => a.id.localeCompare(b.id));
  return menuDepthLimit(assigned);
}

function cryptoRandom(): string {
  // Non-cryptographic: a collision fails the unique index and the editor gets a
  // retryable error.
  return Math.random().toString(36).slice(2, 10);
}
