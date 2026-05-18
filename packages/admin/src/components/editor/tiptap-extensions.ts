import type { Extensions } from "@tiptap/react";
import { HtmlBadgeNodeView } from "@/editor/unknown-block/HtmlBadgeNodeView.js";
import { UnknownBlockNodeView } from "@/editor/unknown-block/UnknownBlockNodeView.js";
import { Document } from "@tiptap/extension-document";
import { Dropcursor } from "@tiptap/extension-dropcursor";
import { Gapcursor } from "@tiptap/extension-gapcursor";
import { HardBreak } from "@tiptap/extension-hard-break";
import { History } from "@tiptap/extension-history";
import { Text } from "@tiptap/extension-text";
import { ReactNodeViewRenderer } from "@tiptap/react";

import type {
  BlockRegistry,
  MarkRegistry,
  ResolvedBlockSpec,
  ResolvedMarkSpec,
} from "@plumix/blocks";
import { unknownBlockSchema } from "@plumix/blocks";

import {
  wireBlockSpecExtension,
  wireMarkSpecExtension,
} from "./spec-extensions.js";

interface RichtextAllowlistInput {
  readonly marks?: readonly string[];
  readonly nodes?: readonly string[];
  readonly blocks?: readonly string[];
}

interface BuildExtensionsInput {
  readonly allowlist?: RichtextAllowlistInput;
  readonly blockRegistry?: BlockRegistry;
  readonly markRegistry?: MarkRegistry;
}

// ProseMirror requires `doc`/`text`; the rest are editor-UX plugins
// (dropcursor / gapcursor) plus undo-redo history. Pulled in directly
// instead of via StarterKit so the schema's block + mark layer is
// purely registry-driven.
function baselineExtensions(): Extensions {
  return [Document, Text, HardBreak, Dropcursor, Gapcursor, History];
}

// `allowlist === undefined` → canvas mode (every registry entry). Defined →
// strict richtext-field mode filtered against the field's `marks` / `nodes`.
export function buildTiptapExtensions(
  input: BuildExtensionsInput = {},
): Extensions {
  const { allowlist, blockRegistry, markRegistry } = input;
  if (allowlist === undefined) {
    return [
      ...baselineExtensions(),
      ...registryNodeExtensions(blockRegistry, () => true),
      ...registryMarkExtensions(markRegistry, () => true),
      unknownBlockSchema.extend({
        addNodeView() {
          return ReactNodeViewRenderer(UnknownBlockNodeView);
        },
      }),
    ];
  }
  const allowedMarks = new Set(allowlist.marks ?? []);
  const allowedNodes = new Set(allowlist.nodes ?? []);
  return [
    ...baselineExtensions(),
    ...registryNodeExtensions(
      blockRegistry,
      (spec) =>
        spec.name === FIELD_MODE_IMPLICIT_BLOCK ||
        matchesAllowlist(spec, allowedNodes),
    ),
    ...registryMarkExtensions(markRegistry, (spec) =>
      matchesAllowlist(spec, allowedMarks),
    ),
  ];
}

// Field allowlists use unnamespaced names (`"heading"`, `"bold"`) inherited
// from the StarterKit-era contract — match by canonical name OR any
// `legacyAliases` entry so existing fields don't need to migrate.
function matchesAllowlist(
  spec: { name: string; legacyAliases?: readonly string[] },
  allowed: ReadonlySet<string>,
): boolean {
  if (allowed.has(spec.name)) return true;
  return spec.legacyAliases?.some((alias) => allowed.has(alias)) ?? false;
}

// Mirrors the server-side `IMPLICIT_NODES = ["doc","paragraph","text"]`
// in `richtext-validate.ts`: `doc` / `text` come from the baseline; the
// editor needs a default block-group node to satisfy `doc.content =
// "block+"` and split on Enter, regardless of what the field's `nodes`
// allowlist declares. Without this, `richtext({ nodes: ["heading"] })`
// would mount with no paragraph fallback and Enter inside a heading
// would have nowhere to split into.
const FIELD_MODE_IMPLICIT_BLOCK = "core/paragraph";

function registryNodeExtensions(
  registry: BlockRegistry | undefined,
  filter: (spec: ResolvedBlockSpec) => boolean,
): Extensions {
  if (!registry) return [];
  const exts: Extensions = [];
  for (const [, spec] of registry) {
    if (!filter(spec)) continue;
    const wired = wireBlockSpecExtension(spec);
    if (spec.name === "core/html") {
      exts.push(
        wired.extend({
          addNodeView() {
            return ReactNodeViewRenderer(HtmlBadgeNodeView);
          },
        }),
      );
      continue;
    }
    exts.push(wired);
  }
  return exts;
}

function registryMarkExtensions(
  registry: MarkRegistry | undefined,
  filter: (spec: ResolvedMarkSpec) => boolean,
): Extensions {
  if (!registry) return [];
  const exts: Extensions = [];
  for (const [, spec] of registry) {
    if (!filter(spec)) continue;
    exts.push(wireMarkSpecExtension(spec));
  }
  return exts;
}
