import type { BlockRegistry, MarkRegistry, TiptapNode } from "./index.js";
import type { BlockContentValidationIssue } from "./validation-errors.js";

export type BlockContentValidationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly errors: readonly BlockContentValidationIssue[];
    };

interface Registries {
  readonly blocks: BlockRegistry;
  readonly marks: MarkRegistry;
}

/**
 * Walks a Tiptap-JSON content blob, checking every node and mark
 * against the supplied registries. Pure — callers map the result
 * onto whatever error envelope they expose at their trust boundary
 * (the entry RPC maps it to `INVALID_BLOCK_CONTENT`).
 *
 * The reserved `unknown` Tiptap node type is recognised so explicit
 * unknown-content round-tripping isn't flagged.
 */
export function validateBlockContent(
  content: unknown,
  registries: Registries,
): BlockContentValidationResult {
  // Root must be a Tiptap `doc` node — anything else (primitive,
  // array, object missing `type`) is malformed. Reject at the
  // boundary rather than letting a hostile payload walk past the
  // checks below. `null` / `undefined` are accepted upstream by the
  // RPC layer as "no content" and never reach this function.
  if (!isTiptapNode(content)) {
    return rootError(`<${typeof content}>`);
  }
  if (content.type !== "doc") {
    return rootError(content.type);
  }
  const errors: BlockContentValidationIssue[] = [];
  for (const [i, child] of (content.content ?? []).entries()) {
    walk(child, `content[${i}]`, errors, registries);
  }
  if (errors.length === 0) return { ok: true };
  return { ok: false, errors };
}

function rootError(nodeName: string): BlockContentValidationResult {
  return {
    ok: false,
    errors: [
      {
        code: "unknown_block_type",
        message: "Content root must be a Tiptap `doc` node.",
        path: "",
        nodeName,
      },
    ],
  };
}

function isTiptapNode(value: unknown): value is TiptapNode {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

function walk(
  node: TiptapNode | null | undefined,
  path: string,
  out: BlockContentValidationIssue[],
  registries: Registries,
): void {
  if (!node) return;
  if (node.type === "text") {
    // Marks live only on text nodes per Tiptap's schema. Walking
    // `text.content` is meaningless — text nodes don't carry
    // children — and a hostile payload that smuggles `content` in
    // here would otherwise recurse at a nonsensical path.
    node.marks?.forEach((mark, i) => {
      if (!registries.marks.has(mark.type)) {
        out.push({
          code: "unknown_mark",
          message: `Unknown mark "${mark.type}" at ${path}.marks[${i}].`,
          path: `${path}.marks[${i}]`,
          markName: mark.type,
        });
      }
    });
    return;
  }
  if (node.type === "unknown") {
    // `unknown` blocks are atoms by design — their original `content`
    // lives inside the opaque `payload` attr, not on `content[]`. A
    // payload that smuggles real children here would let attackers
    // hide nodes that bypass type validation entirely.
    return;
  }
  if (!registries.blocks.has(node.type)) {
    out.push({
      code: "unknown_block_type",
      message: `Unknown block type "${node.type}" at ${path}.`,
      path,
      nodeName: node.type,
    });
    return;
  }
  node.content?.forEach((child, i) => {
    walk(child, `${path}.content[${i}]`, out, registries);
  });
}
