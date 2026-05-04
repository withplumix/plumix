// Server-side Tiptap ProseMirror JSON validator. Walks a saved doc
// against the field's `marks` / `nodes` / `blocks` allowlist and
// rejects any disallowed type/mark name with a JSON-path pointer to
// the offending location.
//
// The validator is a sanitize-shaped function (sync, no DB). Plug
// it into a `richtext()` field's `sanitize` callback to reject
// disallowed content before `applyMetaPatch` writes it. The wire
// shape returned is the unchanged input — this is a validator, not
// a transformer (a transformer would silently strip disallowed
// nodes, hiding edits the editor already prevented from being
// surfaced; reject loud here so the editor's allowlist + server's
// allowlist stay in lockstep).

interface TiptapNodeShape {
  readonly type?: unknown;
  readonly content?: unknown;
  readonly marks?: unknown;
  readonly attrs?: unknown;
  readonly text?: unknown;
}

/**
 * Always-allowed type names. ProseMirror requires these for any
 * document to parse, and the editor crashes at mount if they're
 * missing. Treat them as implicit; the field's allowlists declare
 * everything *else*.
 */
const IMPLICIT_NODES: ReadonlySet<string> = new Set([
  "doc",
  "paragraph",
  "text",
]);

/**
 * Final href gate. Mirrors the regex in `route/render/tiptap.ts`'s
 * `sanitizeHref` — keep them in sync. Blocks `javascript:`, `data:`,
 * `vbscript:`, `file:` and their variants. Fragment / query-only /
 * relative refs pass.
 */
const SAFE_HREF_RE = /^(https?:\/\/|mailto:|tel:|\/|#|\?|\.\.?\/)/i;

/**
 * Maximum nesting depth the validator will recurse through. The
 * meta-pipeline byte cap (256 KiB) doesn't bound depth alone — a
 * pathological payload of ~30 bytes per level can reach ~8.5k levels
 * within the cap, blowing the JS engine's stack budget. 100 covers
 * any realistic authoring (deep blockquotes, nested lists rarely
 * exceed 5-10 levels) and keeps the validator within a safe stack
 * envelope on Workers / Node alike.
 */
const MAX_RICHTEXT_DEPTH = 100;

interface RichtextAllowlist {
  readonly marks?: readonly string[];
  readonly nodes?: readonly string[];
  readonly blocks?: readonly string[];
}

/**
 * Build a sanitize-shaped validator for a `richtext` field. Returns
 * a function that walks a Tiptap JSON doc and either passes the
 * input through unchanged or throws a `RichtextValidationError`
 * pinpointing the first offending node/mark.
 *
 * Throws on the FIRST violation rather than collecting all of them
 * — the editor already prevents these cases at the source, so a
 * server-side reject is an integrity-check failure, not a "warn the
 * user about every issue" UX. Single-shot reject keeps the error
 * surface small.
 */
export function walkRichtextDoc(
  allowlist: RichtextAllowlist,
): (value: unknown) => unknown {
  // Pre-build the type sets so the recursive walker doesn't re-build
  // them on every node.
  const allowedNodeTypes = new Set<string>([
    ...IMPLICIT_NODES,
    ...(allowlist.nodes ?? []),
    ...(allowlist.blocks ?? []),
  ]);
  const allowedMarkTypes = new Set<string>([
    ...(allowlist.marks ?? []),
    ...(allowlist.blocks ?? []),
  ]);
  return (value) => {
    if (value === null || value === undefined) return value;
    walkNode(value, "", 0, allowedNodeTypes, allowedMarkTypes);
    return value;
  };
}

/**
 * Error thrown when the validator encounters a disallowed type or
 * unsafe attribute. Carries the JSON path so the editor (or test
 * harness) can pinpoint the offending location — e.g.
 * `"content[2].content[0].marks[1]"` for a disallowed mark on the
 * third paragraph's first text run's second mark.
 */
export class RichtextValidationError extends Error {
  readonly path: string;
  readonly reason:
    | "disallowed_node"
    | "disallowed_mark"
    | "unsafe_href"
    | "invalid_shape";
  constructor(
    reason: RichtextValidationError["reason"],
    path: string,
    message: string,
  ) {
    super(message);
    this.path = path;
    this.reason = reason;
  }
}

function walkNode(
  value: unknown,
  path: string,
  depth: number,
  allowedNodeTypes: ReadonlySet<string>,
  allowedMarkTypes: ReadonlySet<string>,
): void {
  if (depth > MAX_RICHTEXT_DEPTH) {
    throw new RichtextValidationError(
      "invalid_shape",
      path === "" ? "<root>" : path,
      `richtext nesting exceeds ${MAX_RICHTEXT_DEPTH} levels`,
    );
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RichtextValidationError(
      "invalid_shape",
      path === "" ? "<root>" : path,
      "richtext node must be a plain object",
    );
  }
  const node = value as TiptapNodeShape;
  if (typeof node.type !== "string" || node.type === "") {
    throw new RichtextValidationError(
      "invalid_shape",
      path === "" ? "<root>" : path,
      "richtext node missing string `type`",
    );
  }
  if (!allowedNodeTypes.has(node.type)) {
    throw new RichtextValidationError(
      "disallowed_node",
      path === "" ? "<root>" : path,
      `richtext node type "${node.type}" not in field allowlist`,
    );
  }
  if (Array.isArray(node.marks)) {
    node.marks.forEach((mark, i) => {
      walkMark(mark, `${path}.marks[${i}]`, allowedMarkTypes);
    });
  }
  if (Array.isArray(node.content)) {
    node.content.forEach((child, i) => {
      walkNode(
        child,
        `${path}.content[${i}]`,
        depth + 1,
        allowedNodeTypes,
        allowedMarkTypes,
      );
    });
  }
}

function walkMark(
  value: unknown,
  path: string,
  allowedMarkTypes: ReadonlySet<string>,
): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RichtextValidationError(
      "invalid_shape",
      path,
      "richtext mark must be a plain object",
    );
  }
  const mark = value as TiptapNodeShape;
  if (typeof mark.type !== "string" || mark.type === "") {
    throw new RichtextValidationError(
      "invalid_shape",
      path,
      "richtext mark missing string `type`",
    );
  }
  if (!allowedMarkTypes.has(mark.type)) {
    throw new RichtextValidationError(
      "disallowed_mark",
      path,
      `richtext mark type "${mark.type}" not in field allowlist`,
    );
  }
  // `link` is the only attr we gate at this layer — its `href` is
  // user-supplied and reaches rendered HTML. Unsafe schemes
  // (`javascript:`, `data:`, …) get a hard reject so a doc that
  // cleared the admin's mark-name allowlist but smuggled an unsafe
  // scheme via direct API write doesn't pollute output.
  if (mark.type === "link" && mark.attrs && typeof mark.attrs === "object") {
    const attrs = mark.attrs as Readonly<Record<string, unknown>>;
    const href = attrs.href;
    if (href !== undefined && href !== null && href !== "") {
      if (typeof href !== "string" || !SAFE_HREF_RE.test(href.trim())) {
        // `href` shape is unknown; describe by typeof so we don't
        // tempt a `[object Object]` stringification in the error.
        throw new RichtextValidationError(
          "unsafe_href",
          path,
          `richtext link mark href (${typeof href}) is not a safe URL`,
        );
      }
    }
  }
}
