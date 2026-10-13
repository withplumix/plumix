// Standalone so the React-free element chunk never imports the renderer.

export type PlumixRenderMode = "live" | "preview" | "edit";

/** `null` is the ordinary page (no editor marker present). */
export type IslandPageMode = PlumixRenderMode | null;

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

/**
 * Prototype-pollution defense: `mod["__proto__"]` would resolve to
 * `Object.prototype` and be mounted as the component.
 */
const FORBIDDEN_EXPORT_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export function isForbiddenIslandExport(name: string): boolean {
  return FORBIDDEN_EXPORT_KEYS.has(name);
}

/** Prefetch only helps when it fires strictly before hydration. */
export function shouldPrefetch(
  hydrateWhen: string,
  prefetchWhen: string,
): boolean {
  if (hydrateWhen === "load" || hydrateWhen === "only") return false;
  return hydrateWhen !== prefetchWhen;
}
