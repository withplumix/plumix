import type { ComponentData, Data } from "@puckeditor/core";

import { serializePatternSource } from "@plumix/blocks";

import { derivePatternSlug } from "./derive-pattern-slug.js";
import { puckDataToBlockTree } from "./puck-to-block-tree.js";

interface BuildCopyPatternSourceArgs {
  readonly title: string;
  readonly data: Pick<Data, "content">;
  readonly selectedItem: ComponentData | null;
}

export function buildCopyPatternSource({
  title,
  data,
  selectedItem,
}: BuildCopyPatternSourceArgs): string {
  const content = selectedItem ? [selectedItem] : data.content;
  const nodes = puckDataToBlockTree({ content });
  return serializePatternSource(nodes, {
    slug: derivePatternSlug(title),
    title: title.trim() || "Untitled",
  });
}
