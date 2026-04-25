import type { AppContext } from "../../../context/app.js";
import { and, eq, inArray } from "../../../db/index.js";
import { entryTerm } from "../../../db/schema/entry_term.js";
import { terms } from "../../../db/schema/terms.js";

// Errors a `terms` patch can raise. Helpers receive callable throwers
// so the orpc-typed `errors` map at the handler call-site doesn't have
// to leak its concrete shape into shared code.
interface TermPatchThrowers {
  taxonomyNotFound(taxonomy: string): never;
  forbidden(capability: string): never;
  termTaxonomyMismatch(): never;
}

/**
 * Validate a `terms` patch from an entry create/update payload:
 * - every taxonomy must be registered with core
 * - the caller must hold `term:<taxonomy>:assign` for each taxonomy
 *   that appears in the patch
 * - each (taxonomy, termId) pair must reference an existing term in
 *   that taxonomy (catches cross-taxonomy id reuse and stale ids)
 *
 * Pure validation — no writes happen here. Callers run this before
 * inserting the entry row so a bad patch fails up-front rather than
 * leaving an orphaned entry behind.
 */
export async function assertTermsPatchValid(
  context: AppContext,
  termsPatch: Record<string, readonly number[]>,
  throwers: TermPatchThrowers,
): Promise<void> {
  for (const taxonomy of Object.keys(termsPatch)) {
    if (!context.plugins.termTaxonomies.has(taxonomy)) {
      throwers.taxonomyNotFound(taxonomy);
    }
    if (!context.auth.can(`term:${taxonomy}:assign`)) {
      throwers.forbidden(`term:${taxonomy}:assign`);
    }
  }
  for (const [taxonomy, termIds] of Object.entries(termsPatch)) {
    const unique = Array.from(new Set(termIds));
    if (unique.length === 0) continue;
    const rows = await context.db
      .select({ id: terms.id })
      .from(terms)
      .where(and(eq(terms.taxonomy, taxonomy), inArray(terms.id, unique)));
    if (rows.length !== unique.length) {
      throwers.termTaxonomyMismatch();
    }
  }
}

/**
 * Replace `entry_term` rows for every (entryId, taxonomy) pair in the
 * patch. Each taxonomy is rewritten independently — taxonomies absent
 * from the patch keep their existing assignments. An empty array
 * clears the taxonomy's assignments without touching the others.
 */
export async function applyTermPatch(
  context: AppContext,
  entryId: number,
  termsPatch: Record<string, readonly number[]>,
): Promise<void> {
  for (const [taxonomy, termIds] of Object.entries(termsPatch)) {
    const unique = Array.from(new Set(termIds));
    // Scope the delete to rows whose term belongs to this taxonomy — saves a
    // per-term round-trip and avoids accidentally wiping another taxonomy's
    // rows in the same entry_term table.
    const existingAssignments = await context.db
      .select({ termId: entryTerm.termId })
      .from(entryTerm)
      .innerJoin(terms, eq(entryTerm.termId, terms.id))
      .where(and(eq(entryTerm.entryId, entryId), eq(terms.taxonomy, taxonomy)));
    if (existingAssignments.length > 0) {
      const ids = existingAssignments.map((r) => r.termId);
      await context.db
        .delete(entryTerm)
        .where(
          and(eq(entryTerm.entryId, entryId), inArray(entryTerm.termId, ids)),
        );
    }

    if (unique.length > 0) {
      // onConflictDoNothing handles the race where a concurrent write beat us
      // to inserting the same (entryId, termId) row — the desired end state
      // (row exists) is reached regardless of which request inserted it.
      await context.db
        .insert(entryTerm)
        .values(
          unique.map((termId, index) => ({
            entryId,
            termId,
            sortOrder: index,
          })),
        )
        .onConflictDoNothing({
          target: [entryTerm.entryId, entryTerm.termId],
        });
    }
  }
}

/**
 * Load the assigned term ids per taxonomy for an entry, shaped for
 * the wire as `{ [taxonomy]: number[] }`. Empty taxonomies are
 * omitted; ordering matches the `entry_term.sortOrder` the editor
 * persisted.
 */
export async function loadEntryTerms(
  context: AppContext,
  entryId: number,
): Promise<Record<string, number[]>> {
  const rows = await context.db
    .select({
      taxonomy: terms.taxonomy,
      termId: entryTerm.termId,
      sortOrder: entryTerm.sortOrder,
    })
    .from(entryTerm)
    .innerJoin(terms, eq(entryTerm.termId, terms.id))
    .where(eq(entryTerm.entryId, entryId));

  const grouped: Record<string, { termId: number; sortOrder: number }[]> = {};
  for (const row of rows) {
    const bucket = (grouped[row.taxonomy] ??= []);
    bucket.push({ termId: row.termId, sortOrder: row.sortOrder });
  }

  const out: Record<string, number[]> = {};
  for (const [taxonomy, items] of Object.entries(grouped)) {
    items.sort((a, b) => a.sortOrder - b.sortOrder);
    out[taxonomy] = items.map((i) => i.termId);
  }
  return out;
}
