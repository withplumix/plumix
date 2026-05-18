import type { Extensions } from "@tiptap/core";
import { Editor, Node } from "@tiptap/core";
import { renderToStaticMarkup } from "react-dom/server";

import type { MarkComponent, MarkRegistry, MarkSpec } from "../marks/types.js";
import type {
  BlockComponent,
  BlockContext,
  BlockRegistry,
  BlockSpec,
  TiptapNode,
} from "../types.js";
import { coreMarks } from "../marks/core/index.js";
import { mergeMarkRegistry } from "../marks/registry.js";
import { mergeBlockRegistry } from "../registry.js";
import { EntryContent } from "../walker.js";

// PRD-named alias; the underlying function is the canonical impl shared
// with the server-side validator so there's literally no chance of drift.
export { validateBlockContent as validateContent } from "../validate-content.js";

// Top-level await keeps `renderBlock` synchronous; mirrors buildApp.
const DEFAULT_MARK_REGISTRY: MarkRegistry = await mergeMarkRegistry({
  core: coreMarks,
  plugins: [],
  themeOverrides: {},
  themeId: null,
});

const EMPTY_CONTEXT: BlockContext = {
  entry: null,
  siteSettings: {},
  theme: null,
  parent: null,
  depth: 0,
};

interface MockRegistryInput {
  readonly core?: readonly BlockSpec[];
  readonly plugins?: readonly {
    readonly spec: BlockSpec;
    readonly pluginId: string;
  }[];
  readonly themeOverrides?: Readonly<Record<string, BlockComponent>>;
  readonly themeId?: string | null;
}

export async function mockRegistry(
  input: MockRegistryInput = {},
): Promise<BlockRegistry> {
  return mergeBlockRegistry({
    core: input.core ?? [],
    plugins: input.plugins ?? [],
    themeOverrides: input.themeOverrides ?? {},
    themeId: input.themeId ?? null,
  });
}

interface MockMarkRegistryInput {
  readonly core?: readonly MarkSpec[];
  readonly plugins?: readonly {
    readonly spec: MarkSpec;
    readonly pluginId: string;
  }[];
  readonly themeOverrides?: Readonly<Record<string, MarkComponent>>;
  readonly themeId?: string | null;
}

export async function mockMarkRegistry(
  input: MockMarkRegistryInput = {},
): Promise<MarkRegistry> {
  return mergeMarkRegistry({
    core: input.core ?? [],
    plugins: input.plugins ?? [],
    themeOverrides: input.themeOverrides ?? {},
    themeId: input.themeId ?? null,
  });
}

interface RenderBlockInput {
  readonly registry: BlockRegistry;
  readonly markRegistry?: MarkRegistry;
  readonly content: TiptapNode | readonly TiptapNode[];
  readonly context?: BlockContext;
}

export function renderBlock(input: RenderBlockInput): string {
  return renderToStaticMarkup(
    EntryContent({
      content: input.content,
      registry: input.registry,
      markRegistry: input.markRegistry ?? DEFAULT_MARK_REGISTRY,
      context: input.context ?? EMPTY_CONTEXT,
    }),
  );
}

// Minimal ProseMirror baseline so `new Editor` stands up without StarterKit.
const Doc = Node.create({ name: "doc", topNode: true, content: "block+" });
const Paragraph = Node.create({
  name: "paragraph",
  group: "block",
  content: "inline*",
  parseHTML: () => [{ tag: "p" }],
  renderHTML: () => ["p", 0],
});
const Text = Node.create({ name: "text", group: "inline" });

interface MockEditorInput {
  readonly extensions?: Extensions;
}

export function mockEditor(input: MockEditorInput = {}): Editor {
  return new Editor({
    extensions: [Doc, Paragraph, Text, ...(input.extensions ?? [])],
  });
}

export { DEFAULT_MARK_REGISTRY as defaultMarkRegistry, EMPTY_CONTEXT };

// Block specs now own their CSS Module class + `data-plumix-block`
// identity attribute, but most assertion fixtures pre-date both. Strip
// them before comparison so the structural shape stays under test
// without coupling each fixture to a per-block class name.
export function stripBlockMarkers(html: string): string {
  return html
    .replace(/ class="[^"]*"/g, "")
    .replace(/ data-plumix-block="[^"]*"/g, "");
}
