import type { AppContext } from "../context/app.js";
import type { ImageRoleName } from "../plugin/image-roles.js";
import type { LookupAdapter } from "../plugin/lookup.js";
import type { MetaBoxField } from "../plugin/manifest.js";
import { inArray } from "../db/index.js";
import { entries } from "../db/schema/entries.js";
import { definePlugin } from "../plugin/define.js";

/** What the photo kind hydrates to — the shape its own `image()` reads. */
export interface PhotoReference {
  readonly id: string;
  readonly src: string;
  /** False stands in for a payload that is not an image (a PDF's mime). */
  readonly usable: boolean;
}

/**
 * A reference kind whose payloads are images — the seam `images.<role>` reads
 * through, without core's tests reaching for the media plugin. Entry rows
 * stand in for photo rows, so hydration is a real `IN (...)` and a query-count
 * assertion counts what the database saw; a row titled `"broken"` is the
 * payload the adapter refuses.
 */
export const photoLookupAdapter = {
  list: async (ctx, { ids }) => {
    const rows = await photoRows(ctx, ids ?? []);
    return rows.map((row) => ({ id: String(row.id), label: row.title }));
  },
  hydrate: async (ctx, { ids }) => {
    const rows = await photoRows(ctx, ids);
    return rows.map((row): PhotoReference => ({
      id: String(row.id),
      src: photoUrl(row.id),
      usable: row.title !== "broken",
    }));
  },
  image: (payload: PhotoReference) =>
    payload.usable ? { url: payload.src, alt: null } : null,
} satisfies LookupAdapter;

/** The URL `photoLookupAdapter` hands back for a given row id. */
export function photoUrl(id: number | string): string {
  return `/photos/${String(id)}.png`;
}

async function photoRows(ctx: AppContext, ids: readonly string[]) {
  const numeric = ids.map(Number).filter(Number.isSafeInteger);
  if (numeric.length === 0) return [];
  return ctx.db
    .select({ id: entries.id, title: entries.title })
    .from(entries)
    .where(inArray(entries.id, numeric));
}

/**
 * The user scope with one `featured` role field — what both the author and
 * batch suites need, spelled once because neither varies it.
 */
export const photoProfilePlugin = definePlugin("test-photo-profile", (ctx) => {
  ctx.registerLookupAdapter({ kind: "photo", adapter: photoLookupAdapter });
  ctx.registerUserMetaBox("profile", {
    label: "Profile",
    fields: [photoField("portrait", { role: "featured" })],
  });
});

/** A media-shaped field pointing at the photo kind. */
export function photoField(
  key: string,
  options: { readonly role?: ImageRoleName; readonly showInApi?: boolean } = {},
): MetaBoxField {
  return {
    key,
    label: key,
    type: "json",
    inputType: "media",
    referenceTarget: { kind: "photo" },
    ...(options.role === undefined ? {} : { role: options.role }),
    ...(options.showInApi === undefined
      ? {}
      : { showInApi: options.showInApi }),
  };
}
