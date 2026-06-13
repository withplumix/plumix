import type { AppContext } from "../context/app.js";
import type { RegisteredTermTaxonomy } from "../plugin/manifest.js";
import type { RestErrors } from "./errors.js";
import type { PublicTerm } from "./schemas.js";
import { TermReadError } from "../terms/errors.js";
import { getTerm, listTerms } from "../terms/read-service.js";
import { listEnvelope } from "./envelope.js";
import { projectTerm } from "./projection.js";
import { readPagination } from "./schemas.js";

// The public gate lives in `resolvePublicTaxonomy` (the dispatcher), not in the
// term service — `term:<taxonomy>:read` is granted to subscriber for every
// taxonomy, public or not. Only route public taxonomies here.
//
// Term reads hide existence the same way entry reads do: a missing term, an
// unreadable taxonomy, or a wrong-taxonomy lookup all collapse to 404.
function termNotFound(error: unknown, errors: RestErrors): unknown {
  if (error instanceof TermReadError) {
    return errors.NOT_FOUND({ data: { kind: "term" } });
  }
  return error;
}

// A paginated envelope of a public taxonomy's terms.
export async function listTermsEnvelope(
  context: AppContext,
  taxonomy: RegisteredTermTaxonomy,
  url: URL,
) {
  const { page, perPage, offset } = readPagination(url);
  const fetched = await listTerms(context, {
    taxonomy: taxonomy.name,
    limit: perPage + 1,
    offset,
  });
  const hasNext = fetched.length > perPage;
  const rows = hasNext ? fetched.slice(0, perPage) : fetched;

  return listEnvelope(rows.map(projectTerm), { url, page, perPage, hasNext });
}

// One term. A term in another taxonomy is hidden (404) rather than revealed.
export async function getTermItem(
  context: AppContext,
  taxonomy: RegisteredTermTaxonomy,
  id: number,
  errors: RestErrors,
): Promise<PublicTerm> {
  let term: Awaited<ReturnType<typeof getTerm>>;
  try {
    term = await getTerm(context, { id });
  } catch (error) {
    throw termNotFound(error, errors);
  }

  if (term.taxonomy !== taxonomy.name) {
    throw errors.NOT_FOUND({ data: { kind: "term" } });
  }
  return projectTerm(term);
}
