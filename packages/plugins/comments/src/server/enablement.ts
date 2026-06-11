import type { CommentsConfig } from "../types.js";

/**
 * The `supports` flag an entry type declares to opt into comments —
 * the WordPress `post_type_supports($type, 'comments')` model. Lives in
 * the entry type's open `supports: string[]` array.
 */
export const COMMENTS_SUPPORT = "comments";

/**
 * Whether commenting is enabled for an entry type. The effective set is
 * the union of two sources: types the site lists in `config.entryTypes`,
 * and types that self-declare `supports: ['comments']` at registration.
 *
 * @param typeName  the entry type (e.g. `"post"`).
 * @param supports  the type's registered `supports` array, if any.
 * @param config    the resolved plugin config.
 */
export function isCommentingEnabled(
  typeName: string,
  supports: readonly string[] | undefined,
  config: CommentsConfig,
): boolean {
  if (config.entryTypes?.includes(typeName)) return true;
  return supports?.includes(COMMENTS_SUPPORT) ?? false;
}
