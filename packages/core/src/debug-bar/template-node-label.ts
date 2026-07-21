import type { ResolvedNode } from "../route/render/template-hierarchy.js";

/** Panel id + collector namespace for the template hierarchy resolution. */
export const TEMPLATE_PANEL_ID = "template";

/** A human label for the resolved route node, for the Template panel. */
export function templateNodeLabel(node: ResolvedNode): string {
  switch (node.kind) {
    case "content":
      return `${node.entryType}: ${node.slug}`;
    case "term":
      return `${node.taxonomy}: ${node.slug}`;
    case "author":
      return `author: ${node.slug}`;
    case "date":
      return `date: ${[node.year, node.month, node.day]
        .filter((v) => v !== null)
        .join("-")}`;
    case "custom":
      return `archive: ${node.name}`;
    case "content-type-archive":
      return `${node.entryType} archive`;
    case "front-page":
      return "front page";
    case "search":
      return "search";
  }
}
