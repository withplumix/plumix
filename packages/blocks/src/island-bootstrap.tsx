import type { ReactElement } from "react";

import type { ActiveIsland } from "./islands.js";
import type { BlockRegistry, TiptapNode } from "./types.js";
import { collectActiveIslands } from "./islands.js";

export interface PlumixIslandBootstrapProps {
  readonly content: TiptapNode | readonly TiptapNode[] | null | undefined;
  readonly registry: BlockRegistry;
}

/**
 * SSR-only script-tag emitter. Pre-walks the content + registry to find
 * every active client-island module, then renders a single
 * `<script type="module">` whose bootstrap dynamically imports each
 * unique island and invokes its init export on every matching
 * placeholder element the walker emitted (`[data-plumix-island="..."]`).
 *
 * Returns `null` when no island is active so SSR shells can mount this
 * unconditionally without bloating empty pages with an inert script.
 */
export function PlumixIslandBootstrap({
  content,
  registry,
}: PlumixIslandBootstrapProps): ReactElement | null {
  const islands = collectActiveIslands(content, registry);
  if (islands.length === 0) return null;
  return (
    <script
      type="module"
      dangerouslySetInnerHTML={{ __html: buildBootstrap(islands) }}
    />
  );
}

function buildBootstrap(islands: readonly ActiveIsland[]): string {
  const manifest = jsonForScriptTag(
    islands.map((i) => ({
      name: i.name,
      src: i.src,
      export: i.export ?? "default",
    })),
  );
  return [
    `const islands = ${manifest};`,
    `for (const i of islands) {`,
    `  const mod = await import(i.src);`,
    `  const init = mod[i.export];`,
    `  if (typeof init !== "function") continue;`,
    `  for (const el of document.querySelectorAll(\`[data-plumix-island="\${i.name}"]\`)) {`,
    `    const raw = el.getAttribute("data-plumix-island-attrs");`,
    `    init(el, raw ? JSON.parse(raw) : {});`,
    `  }`,
    `}`,
  ].join("\n");
}

// Escape every character JSON.stringify leaves bare but that can
// terminate a `<script>` body or a JS string literal. Defense in
// depth — `defineBlock` already rejects these in `client.src` /
// `client.export`, and React escapes them in attrs — but the
// bootstrap is the one place JSON lands directly in executable
// JS source, so we belt-and-brace it here.
// Exported for direct unit testing — `buildBootstrap` is private and
// `defineBlock` rejects hostile values upstream, so the only way to drive
// the encoder with `</script>` etc. is to call it in isolation.
export function jsonForScriptTag(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
