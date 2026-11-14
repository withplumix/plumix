import type { AppContext } from "../../../context/app-context.js";
import type { TermAssignment } from "./writes-shared.js";
import { entryTag, termTag } from "../../../cdn/contract/tags.js";
import { enqueuePurgeTags } from "../../../cdn/purge.js";
import { and, count, eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { entryTerm } from "../../../db/schema/entry_term.js";
import { terms } from "../../../db/schema/terms.js";
import { writeErrors as errors } from "../entry/writes-shared.js";

/**
 * Purges the entry, whose page shows its terms, and the term, whose archive
 * lists its entries: no lifecycle action announces a link.
 */
export async function assignTerm(
  context: AppContext,
  { entryId, termId }: TermAssignment,
): Promise<void> {
  const target = await context.db.query.terms.findFirst({
    columns: { taxonomy: true },
    where: eq(terms.id, termId),
  });
  if (!target) throw errors.NOT_FOUND({ data: { kind: "term", id: termId } });
  const entry = await context.db.query.entries.findFirst({
    columns: { id: true },
    where: eq(entries.id, entryId),
  });
  if (!entry) throw errors.NOT_FOUND({ data: { kind: "entry", id: entryId } });

  const [held] = await context.db
    .select({ count: count() })
    .from(entryTerm)
    .innerJoin(terms, eq(entryTerm.termId, terms.id))
    .where(
      and(eq(entryTerm.entryId, entryId), eq(terms.taxonomy, target.taxonomy)),
    );
  await context.db
    .insert(entryTerm)
    .values({ entryId, termId, sortOrder: held?.count ?? 0 })
    .onConflictDoNothing({ target: [entryTerm.entryId, entryTerm.termId] });

  enqueuePurgeTags(context, [entryTag(entryId), termTag(termId)]);
}
