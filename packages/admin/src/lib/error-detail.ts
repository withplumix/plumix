/** The text the error boundary reveals behind its Show error toggle. */
export function errorDetail(error: unknown): string {
  // Shown verbatim: a client exception has no descriptor to map to, so its
  // text is the only diagnostic.
  return error instanceof Error ? error.message : String(error);
}
