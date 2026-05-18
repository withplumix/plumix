import type { Delta } from "jsondiffpatch";
import { create as createJsonDiff } from "jsondiffpatch";

// Single shared instance; `objectHash` keys arrays by `id`/`name`/`type`
// so block-list edits diff as moves rather than full replacements.
const jsonDiff = createJsonDiff({
  objectHash(item, index) {
    const obj = item as Record<string, unknown>;
    if (typeof obj.id === "string" || typeof obj.id === "number") {
      return `id:${String(obj.id)}`;
    }
    if (typeof obj.type === "string") return `type:${obj.type}:${index}`;
    return `$$index:${index}`;
  },
  arrays: { detectMove: true },
});

export interface JsonDiffResult {
  readonly delta: Delta | undefined;
  readonly hasChanges: boolean;
}

export function diffJson(a: unknown, b: unknown): JsonDiffResult {
  const delta = jsonDiff.diff(a, b);
  return { delta, hasChanges: delta !== undefined };
}

export type TextDiffSegment =
  | { readonly kind: "equal"; readonly text: string }
  | { readonly kind: "insert"; readonly text: string }
  | { readonly kind: "delete"; readonly text: string };

// Word-level Myers diff. Sufficient for short fields (titles, slugs,
// excerpts) and avoids dragging in a full diff library for a one-shot
// inline highlighter.
export function diffText(a: string, b: string): readonly TextDiffSegment[] {
  if (a === b) return a === "" ? [] : [{ kind: "equal", text: a }];
  const aWords = tokenize(a);
  const bWords = tokenize(b);
  return walkLcs(aWords, bWords, buildLcs(aWords, bWords));
}

function tokenize(input: string): readonly string[] {
  // Split on whitespace boundaries while keeping the whitespace so the
  // reassembled diff renders with the original spacing intact.
  return input.split(/(\s+)/).filter((t) => t.length > 0);
}

// Flat (m+1)*(n+1) array — TS keeps the indexed lookups typed as
// `number` rather than the noisy `number | undefined` you'd get from
// a `number[][]` matrix, so the LCS body stays free of `!` asserts.
function buildLcs(
  a: readonly string[],
  b: readonly string[],
): {
  readonly dp: number[];
  readonly stride: number;
} {
  const m = a.length;
  const n = b.length;
  const stride = n + 1;
  const dp = new Array<number>((m + 1) * stride).fill(0);
  const get = (i: number, j: number): number => dp[i * stride + j] ?? 0;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i * stride + j] =
        a[i - 1] === b[j - 1]
          ? get(i - 1, j - 1) + 1
          : Math.max(get(i, j - 1), get(i - 1, j));
    }
  }
  return { dp, stride };
}

function walkLcs(
  a: readonly string[],
  b: readonly string[],
  { dp, stride }: { readonly dp: number[]; readonly stride: number },
): readonly TextDiffSegment[] {
  const segs: TextDiffSegment[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    const aToken = i > 0 ? a[i - 1] : undefined;
    const bToken = j > 0 ? b[j - 1] : undefined;
    if (i > 0 && j > 0 && aToken === bToken && aToken !== undefined) {
      segs.unshift({ kind: "equal", text: aToken });
      i -= 1;
      j -= 1;
    } else if (
      j > 0 &&
      bToken !== undefined &&
      (i === 0 ||
        (dp[i * stride + (j - 1)] ?? 0) >= (dp[(i - 1) * stride + j] ?? 0))
    ) {
      segs.unshift({ kind: "insert", text: bToken });
      j -= 1;
    } else if (aToken !== undefined) {
      segs.unshift({ kind: "delete", text: aToken });
      i -= 1;
    } else {
      // Unreachable: loop invariant guarantees aToken|bToken is defined.
      break;
    }
  }
  return mergeAdjacent(segs);
}

function mergeAdjacent(
  segs: readonly TextDiffSegment[],
): readonly TextDiffSegment[] {
  const out: TextDiffSegment[] = [];
  for (const seg of segs) {
    const last = out.at(-1);
    if (last?.kind === seg.kind) {
      out[out.length - 1] = { kind: seg.kind, text: last.text + seg.text };
    } else {
      out.push(seg);
    }
  }
  return out;
}

// Extracts plain text from a Tiptap JSON document for the Visual tab's
// inline diff. Full ProseMirror-aware diff with decorations is tracked
// as a follow-up; the plain-text projection covers the 80% case
// (paragraph + heading edits) without dragging in `prosemirror-changeset`
// machinery that needs a live schema.
export function extractPlainText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const node = doc as { type?: string; text?: string; content?: unknown[] };
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  const parts = node.content.map((child) => extractPlainText(child));
  // Inline runs (where every child carries a `text` field) collapse
  // without separators so paragraphs read naturally; block siblings
  // get a newline so heading→paragraph boundaries survive the
  // projection.
  const hasInlineText = node.content.some(
    (c) =>
      c !== null &&
      typeof c === "object" &&
      typeof (c as { text?: unknown }).text === "string",
  );
  return hasInlineText ? parts.join("") : parts.join("\n");
}
