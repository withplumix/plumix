/**
 * The one place a comment form's control ids are spelled. A label points
 * at its control by id and the error summary links to it by fragment, so
 * the form rendered on a post and the form a refused comment is handed
 * back on have to agree — otherwise the returned form's summary links
 * address controls that are no longer there.
 */
export function commentFormIdBase(id: number | string): string {
  return `plumix-comment-form-${String(id)}`;
}
