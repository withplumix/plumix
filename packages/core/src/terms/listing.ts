import type { AppContext } from "../context/app-context.js";
import type { SQL } from "../db/index.js";
import { declarePageTags } from "../cdn/contract/page-tags.js";
import { taxonomyListTag } from "../cdn/contract/tags.js";
import { eq } from "../db/index.js";
import { terms } from "../db/schema/terms.js";

/**
 * For a response listing `taxonomy`'s terms: it is stored under the
 * taxonomy's list tag, so a term created or deleted there purges it.
 */
export function taxonomyTermRows(ctx: AppContext, taxonomy: string): SQL {
  declarePageTags(ctx, [taxonomyListTag(taxonomy)]);
  return eq(terms.taxonomy, taxonomy);
}
