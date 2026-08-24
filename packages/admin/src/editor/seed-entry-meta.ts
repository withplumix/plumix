import type { ResolvedMeta } from "@plumix/core";
import type { EntryMetaBoxManifestEntry } from "@plumix/core/manifest";

/**
 * Seed an entry's meta bag for the editor form: keep everything already stored
 * (including foreign keys the editor doesn't own, e.g. `featuredImage` written
 * by another plugin) and fill in each registered field's `.default()` where the
 * key isn't set yet. Stored values always win over a default.
 *
 * Term / user / settings forms seed via `seedFromMetaBoxes`, which projects to
 * just the registered keys — safe there because they send the whole form on
 * save. The entry editor autosaves a *diff*, so it must preserve foreign keys
 * (they'd otherwise be diffed out); seeding `initialMeta`, `metaRef`, and the
 * diff baseline all from this keeps a freshly-opened entry from autosaving a
 * spurious change.
 */
export function seedEntryMetaForm(
  boxes: readonly EntryMetaBoxManifestEntry[],
  stored: ResolvedMeta,
): ResolvedMeta {
  const seeded: Record<string, unknown> = { ...stored };
  for (const box of boxes) {
    for (const field of box.fields) {
      if (seeded[field.key] === undefined && field.default !== undefined) {
        seeded[field.key] = field.default;
      }
    }
  }
  return seeded;
}
