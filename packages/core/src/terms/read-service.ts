import type { AppContext } from "../context/app.js";
import type { Term } from "../db/schema/terms.js";
import type {
  TermGetInput,
  TermListInput,
} from "../rpc/procedures/term/schemas.js";
import { and, asc, eq, isNull, like } from "../db/index.js";
import { terms } from "../db/schema/terms.js";
import { taxonomyCapability } from "../rpc/procedures/term/helpers.js";
import { hydrateTermMeta } from "../rpc/procedures/term/meta.js";
import { TermReadError } from "./errors.js";

type TermRead = Omit<Term, "meta"> & { readonly meta: Record<string, unknown> };

/**
 * List terms in a taxonomy the caller may read. The taxonomy must be
 * registered and the caller must hold its read capability; both checks live
 * here so every transport reads through one policy. Throws {@link TermReadError}.
 */
export async function listTerms(
  ctx: AppContext,
  input: TermListInput,
): Promise<readonly Term[]> {
  if (!ctx.plugins.termTaxonomies.has(input.taxonomy)) {
    throw TermReadError.taxonomyNotFound(input.taxonomy);
  }
  const readCap = taxonomyCapability(input.taxonomy, "read");
  if (!ctx.auth.can(readCap)) throw TermReadError.forbidden(readCap);

  const conditions = [eq(terms.taxonomy, input.taxonomy)];
  if (input.parentId === null) {
    conditions.push(isNull(terms.parentId));
  } else if (input.parentId !== undefined) {
    conditions.push(eq(terms.parentId, input.parentId));
  }
  if (input.search && input.search.length > 0) {
    conditions.push(like(terms.name, `%${input.search}%`));
  }

  return ctx.db
    .select()
    .from(terms)
    .where(and(...conditions))
    .orderBy(asc(terms.name), asc(terms.id))
    .limit(input.limit)
    .offset(input.offset);
}

/**
 * Read a single term by id, hydrated with decoded meta. A missing term and one
 * in a taxonomy the caller can't read both collapse to `term_not_found` so
 * existence stays hidden.
 */
export async function getTerm(
  ctx: AppContext,
  input: TermGetInput,
): Promise<TermRead> {
  const row = await ctx.db.query.terms.findFirst({
    where: eq(terms.id, input.id),
  });
  if (!row) throw TermReadError.termNotFound(input.id);
  if (!ctx.auth.can(taxonomyCapability(row.taxonomy, "read"))) {
    throw TermReadError.termNotFound(input.id);
  }

  const meta = await hydrateTermMeta(ctx, row.taxonomy, row.meta);
  return { ...row, meta };
}
