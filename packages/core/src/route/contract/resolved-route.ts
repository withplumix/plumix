import type { RouteIntent } from "./intent.js";

/**
 * The content route a public request matched, so a reader of the request has
 * the router's answer rather than matching the path again.
 */
export interface ResolvedRoute {
  readonly pattern: string;
  readonly params: Record<string, string>;
  readonly intent: RouteIntent;
}
