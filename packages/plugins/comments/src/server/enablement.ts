/**
 * The `supports` flag an entry type declares to opt into comments —
 * the WordPress `post_type_supports($type, 'comments')` model. Lives in
 * the entry type's open `supports: string[]` array.
 */
export const COMMENTS_SUPPORT = "comments";

/**
 * True for types listed in `entryTypes` or declaring `supports: ['comments']`.
 */
export function isCommentingEnabled(
  typeName: string,
  supports: readonly string[] | undefined,
  config: { readonly entryTypes?: readonly string[] },
): boolean {
  if (config.entryTypes?.includes(typeName)) return true;
  return supports?.includes(COMMENTS_SUPPORT) ?? false;
}
