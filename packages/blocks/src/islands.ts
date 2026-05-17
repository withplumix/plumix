import type { BlockRegistry, TiptapNode } from "./types.js";

/**
 * Static descriptor of one active client island in a rendered entry —
 * the slice the SSR shell needs to emit one `<script type="module">`
 * bootstrap entry. The per-instance attrs travel on the DOM placeholder
 * the walker emits; this descriptor is the (deduped) per-block-type
 * import contract.
 */
export interface ActiveIsland {
  readonly name: string;
  readonly src: string;
  readonly export?: string;
}

/**
 * Pure pre-walk over a Tiptap doc + registry returning every active
 * client-island module — deduped by block name, preserving the order
 * the walker first encounters them. Used by `<PlumixIslandBootstrap>`
 * to emit one import per unique island; the `<EntryContent>` walker
 * still renders the SSR placeholder for each instance separately.
 *
 * Pure (no DOM, no hooks, no React) — safe to call inside the SSR shell
 * before `renderToReadableStream`.
 */
export function collectActiveIslands(
  content: TiptapNode | readonly TiptapNode[] | null | undefined,
  registry: BlockRegistry,
): readonly ActiveIsland[] {
  if (!content) return [];
  const seen = new Map<string, ActiveIsland>();
  const initial: readonly TiptapNode[] = Array.isArray(content)
    ? content
    : [content];
  // Explicit stack instead of recursion: a pathologically nested doc
  // (legacy import, migration bug) shouldn't blow the SSR call stack.
  // Push children in reverse so the pop order matches sibling order.
  const stack: TiptapNode[] = [];
  for (let i = initial.length - 1; i >= 0; i -= 1) {
    const n = initial[i];
    if (n) stack.push(n);
  }
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || node.type === "text") continue;
    if (node.type !== "doc") {
      const spec = registry.get(node.type);
      if (spec?.client && !seen.has(spec.name)) {
        seen.set(spec.name, {
          name: spec.name,
          src: spec.client.src,
          ...(spec.client.export !== undefined && {
            export: spec.client.export,
          }),
        });
      }
    }
    if (node.content) {
      for (let i = node.content.length - 1; i >= 0; i -= 1) {
        const child = node.content[i];
        if (child) stack.push(child);
      }
    }
  }
  return Array.from(seen.values());
}
