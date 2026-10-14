/**
 * The `setMessage` input a row's comment draft saves as: trimmed, and `null`
 * when nothing is left, which clears the comment.
 */
export function revisionMessageInput(
  revisionId: number,
  draft: string,
): { readonly revisionId: number; readonly message: string | null } {
  const message = draft.trim();
  return { revisionId, message: message.length === 0 ? null : message };
}
