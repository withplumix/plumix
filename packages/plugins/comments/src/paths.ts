/**
 * The rendered form and a refused form handed back must agree on ids, or the
 * error summary links break.
 */
export function commentFormIdBase(id: number | string): string {
  return `plumix-comment-form-${String(id)}`;
}
