import type { Data } from "@puckeditor/core";

import type { PatternRegistry } from "@plumix/blocks";
import { rewriteBlockNodeIds } from "@plumix/blocks";

import { blockNodesToPuckContent } from "./entry-content.js";

const PATTERN_REF_BLOCK = "core/pattern-ref";

export function detachPatternRef(
  data: Data,
  index: number,
  patterns: PatternRegistry,
): Data {
  const target = data.content[index];
  if (target?.type !== PATTERN_REF_BLOCK) return data;
  const slug = (target.props as { slug?: unknown }).slug;
  if (typeof slug !== "string") return data;
  const pattern = patterns.get(slug);
  if (!pattern) return data;
  const expanded = blockNodesToPuckContent(
    rewriteBlockNodeIds(pattern.content),
  );
  const next = [...data.content];
  next.splice(index, 1, ...expanded);
  return { ...data, content: next };
}
