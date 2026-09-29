import type { RouteIntent } from "./intent.js";

/**
 * The content route a public request matched: the pattern as it was declared,
 * the params it captured from the path, and what the route is — so a reader
 * of the request (a head filter naming the page's archive) has the router's
 * answer rather than matching the path again.
 */
export interface ResolvedRoute {
  readonly pattern: string;
  readonly params: Record<string, string>;
  readonly intent: RouteIntent;
}
