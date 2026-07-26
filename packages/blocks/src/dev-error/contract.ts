/**
 * The resolved-error contract the shared dev-error renderer consumes. Both the
 * server dev error page (SSR, in core) and the client island overlay (#1603)
 * feed this identical shape, so the two surfaces look and read the same.
 */
export interface DevErrorInfo {
  readonly name: string;
  readonly message: string;
  /** The raw, unresolved stack trace, when the exception carried one. */
  readonly stack?: string;
}
