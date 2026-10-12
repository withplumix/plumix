import type { RendererQueriedEntry } from "../../blocks/renderer/context.js";

/**
 * The entity the public-route resolver matched for this request. `preview`
 * marks an overlaid autosave no public URL serves, so anything published on
 * the page's behalf uses the live row.
 */
export type ResolvedEntity = RendererQueriedEntry;
