import type {
  BlockContentValidationIssue,
  BlockRegistry,
  StylePolicy,
} from "../../../blocks/index.js";
import type { FieldAttr } from "../../../blocks/validate-content.js";
import type { EntryContent } from "../../../db/schema/entries.js";
import type { JsonObject } from "../../../json.js";
import type { FieldPipelineMode } from "../../../meta/field-pipeline.js";
import type {
  BlockContentErrors,
  ConflictErrors,
} from "../../../rpc-errors.js";
import { isEntryContent, validateEntryContent } from "../../../blocks/index.js";
import {
  fieldAttrs,
  withAttrsAtPaths,
} from "../../../blocks/validate-content.js";
import { runFieldPipeline } from "../../../meta/field-pipeline.js";
import { MAX_CONTENT_BYTES } from "./schemas.js";

/**
 * valibot can't measure the post-serialize size of a structural payload,
 * so the cap lives here instead of on the schema.
 */
export function assertContentWithinByteCap(
  content: EntryContent | null | undefined,
  errors: ConflictErrors,
): void {
  if (content == null) return;
  if (JSON.stringify(content).length > MAX_CONTENT_BYTES) {
    throw errors.CONFLICT({ data: { reason: "content_too_large" } });
  }
}

/**
 * Settles each field attr `content` changes. What `starting` holds on a node
 * with the same `id` is kept, whatever the registry, theme or field say.
 */
export async function settleContentAgainstRegistries(
  content: EntryContent | null | undefined,
  starting: readonly (EntryContent | null | undefined)[],
  registries: {
    readonly blocks: BlockRegistry;
    readonly allowedBlocks?: ReadonlySet<string>;
    readonly stylePolicy?: StylePolicy;
    readonly auth: { can(capability: string): boolean };
  },
  errors: BlockContentErrors,
  /** Without `capability`, a save changes only the content inputs of `from`. */
  layout: {
    readonly capability: string;
    readonly from: readonly (EntryContent | null | undefined)[];
  },
  check: FieldAttrCheck,
): Promise<EntryContent | null | undefined> {
  if (content == null) return content;
  // The walker renders anything but the v2 envelope as nothing, so it passes.
  if (!isEntryContent(content)) return content;
  const stored = starting.filter((entry) => isEntryContent(entry));
  const result = validateEntryContent(
    content,
    registries.blocks,
    stored,
    registries.allowedBlocks,
    registries.stylePolicy,
    {
      can: (capability) => registries.auth.can(capability),
      layoutFrom: registries.auth.can(layout.capability)
        ? undefined
        : layout.from.filter((entry) => isEntryContent(entry)),
    },
  );
  const issues = result.ok ? [] : [...result.errors];
  const settled = await settleFieldAttrs(
    fieldAttrs(content, stored, registries.blocks),
    check,
  );
  issues.push(...settled.issues);
  if (issues.length > 0) {
    throw errors.INVALID_BLOCK_CONTENT({ data: { issues } });
  }
  return withAttrsAtPaths(content, registries.blocks, settled.attrs);
}

/**
 * The mode meta checks its fields in for the same save. `publish` also checks
 * every stored attr strictly, as publishing checks meta's whole bag.
 */
export type FieldAttrCheck = FieldPipelineMode | "publish";

/** The field attrs alone, for a publish that promotes content already saved. */
export async function settleContentFieldAttrs(
  content: EntryContent | null,
  starting: readonly (EntryContent | null)[],
  blocks: BlockRegistry,
  check: FieldAttrCheck,
  errors: BlockContentErrors,
): Promise<EntryContent | null> {
  if (!isEntryContent(content)) return content;
  const settled = await settleFieldAttrs(
    fieldAttrs(
      content,
      starting.filter((entry) => isEntryContent(entry)),
      blocks,
    ),
    check,
  );
  if (settled.issues.length > 0) {
    throw errors.INVALID_BLOCK_CONTENT({
      data: { issues: [...settled.issues] },
    });
  }
  return withAttrsAtPaths(content, blocks, settled.attrs);
}

async function settleFieldAttrs(
  all: readonly FieldAttr[],
  check: FieldAttrCheck,
): Promise<{
  readonly attrs: ReadonlyMap<string, JsonObject>;
  readonly issues: readonly BlockContentValidationIssue[];
}> {
  const mode = check === "draft" ? "draft" : "strict";
  const checked = all.filter((attr) => !attr.stored || check === "publish");
  const settled = await Promise.all(
    checked.map(async (attr) => ({
      attr,
      result: await runFieldPipeline(
        attr.field,
        attr.node.attrs?.[attr.field.key],
        attr.field.key,
        mode,
      ),
    })),
  );
  const attrs = new Map<string, JsonObject>();
  const issues: BlockContentValidationIssue[] = [];
  for (const { attr, result } of settled) {
    const { path, node, field } = attr;
    if (result.errors.length > 0) {
      issues.push({
        code: "invalid_attribute",
        message: `Invalid value for "${field.key}" of "${node.name}" at ${path}.`,
        path,
        nodeName: node.name,
        attributeName: field.key,
        errors: [...result.errors],
      });
      continue;
    }
    // A stored value stays as stored, as an untouched meta key does. Absent and
    // null attrs stay as they are, as a meta key would.
    if (attr.stored || result.value === undefined) continue;
    attrs.set(path, {
      ...(attrs.get(path) ?? node.attrs),
      [field.key]: result.value,
    });
  }
  return { attrs, issues };
}
