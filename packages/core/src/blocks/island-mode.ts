// Pure decisions for how an island behaves under the page's render mode,
// read by the React-free island custom element. Kept standalone so the
// element chunk never imports the renderer (which would drag in React).

/** The page render mode, mirrored from the renderer's `PlumixRenderMode`.
 *  `null` is the ordinary page (no editor marker present). */
export type IslandPageMode = "live" | "preview" | "edit" | null;

/** In edit mode an island stays as its static SSR output — selectable, not
 *  interactive. Every other mode (preview, live, or no marker) hydrates. */
export function shouldHydrate(mode: IslandPageMode): boolean {
  return mode !== "edit";
}

/** Label for the placeholder a client-only island shows while editing — it
 *  has no SSR output to keep, so the editor shows what it would mount. */
export function clientOnlyPlaceholderLabel(exportName: string | null): string {
  return `Client-only: ${exportName ?? "default"}`;
}
