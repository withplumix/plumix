import type { ComponentData, Data } from "@puckeditor/core";

import { serializePatternSource } from "@plumix/blocks";

import { derivePatternSlug } from "./derive-pattern-slug.js";
import { puckDataToBlockTree } from "./puck-to-block-tree.js";

interface BuildCopyPatternSourceArgs {
  readonly title: string;
  readonly data: Pick<Data, "content">;
  readonly selectedItem: ComponentData | null;
  /**
   * Pre-resolved title fallback when the entry has no title. Caller
   * threads a localized string (typically `useLabel(M.untitled)`) so
   * this module stays React-free. The lowercase `untitled` slug
   * component is fixed ASCII in `derivePatternSlug` — only the
   * displayed snippet title localizes.
   */
  readonly untitledTitle: string;
}

export function buildCopyPatternSource({
  title,
  data,
  selectedItem,
  untitledTitle,
}: BuildCopyPatternSourceArgs): string {
  const content = selectedItem ? [selectedItem] : data.content;
  const nodes = puckDataToBlockTree({ content });
  return serializePatternSource(nodes, {
    slug: derivePatternSlug(title),
    title: title.trim() || untitledTitle,
  });
}
