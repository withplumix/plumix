import type { BlockAttributeSchema, BlockSpec } from "./types.js";
import { BlockRegistrationError } from "./errors.js";
import { KEYBOARD_SHORTCUT_PATTERN } from "./keyboard-shortcut.js";

const BLOCK_NAME_PATTERN = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/;

/**
 * Validates a block spec at registration time and returns a frozen copy.
 *
 * Validation is strict at the boundary — invalid specs throw
 * `BlockRegistrationError` with a discriminated `code` so the failure is
 * actionable from a test or a CLI doctor command.
 *
 * Schema / name consistency between the spec and the underlying Tiptap
 * node is checked lazily at registry-merge time (the spec's `schema`
 * field is a `() => import(...)` ref; awaiting it here would force the
 * admin-only schema module into the workers bundle).
 */
export function defineBlock<Attrs = Readonly<Record<string, unknown>>>(
  spec: BlockSpec<Attrs>,
): BlockSpec<Attrs> {
  if (!BLOCK_NAME_PATTERN.test(spec.name)) {
    throw BlockRegistrationError.invalidNamePattern({ name: spec.name });
  }
  for (const entry of spec.keyboardShortcuts ?? []) {
    if (!KEYBOARD_SHORTCUT_PATTERN.test(entry.shortcut)) {
      throw BlockRegistrationError.invalidKeyboardShortcut({
        name: spec.name,
        keyboardShortcut: entry.shortcut,
      });
    }
  }
  if (spec.transforms?.priority !== undefined) {
    const p = spec.transforms.priority;
    if (!Number.isInteger(p) || p < 0) {
      throw BlockRegistrationError.invalidTransformPriority({
        name: spec.name,
        priority: p,
      });
    }
  }
  if (spec.client) {
    validateClientIslandField(spec.name, "src", spec.client.src, true);
    if (spec.client.export !== undefined) {
      validateClientIslandField(spec.name, "export", spec.client.export, false);
    }
  }

  const attributes = spec.attributes
    ? Object.freeze(
        Object.fromEntries(
          Object.entries(spec.attributes).map(([attrName, schema]) => [
            attrName,
            Object.freeze({ ...schema }) as BlockAttributeSchema,
          ]),
        ),
      )
    : undefined;

  return Object.freeze<BlockSpec<Attrs>>({
    name: spec.name,
    title: spec.title,
    icon: spec.icon,
    category: spec.category,
    description: spec.description,
    keywords: freezeArray(spec.keywords),
    attributes,
    supports: freezeSupports(spec.supports),
    schema: spec.schema,
    component: spec.component,
    editor: spec.editor,
    client: spec.client,
    legacyAliases: freezeArray(spec.legacyAliases),
    keyboardShortcuts: freezeArrayOfObjects(spec.keyboardShortcuts),
    markdownShortcuts: freezeArrayOfObjects(spec.markdownShortcuts),
    parsePaste: freezeArrayOfObjects(spec.parsePaste),
    transforms: spec.transforms
      ? Object.freeze({
          priority: spec.transforms.priority,
          to: freezeArrayOfObjects(spec.transforms.to),
          from: freezeArrayOfObjects(spec.transforms.from),
        })
      : undefined,
  });
}

// Block characters that could break out of a JSON-embedded
// `<script type="module">` body emitted by `<PlumixIslandBootstrap>`:
// - `<` / `>` / `&` close out of `</script>`, `<!--`, HTML entities;
// - C0 controls and DEL (`\x00`-`\x1f`, `\x7f`) close out of a JS string;
// - U+2028 / U+2029 are line terminators in JS source even though JSON
//   leaves them unescaped — historically the prime XSS-via-JSON vector.
const CLIENT_FIELD_FORBIDDEN_CHARS =
  // eslint-disable-next-line no-control-regex
  /[<>&\u0000-\u001f\u007f\u2028\u2029]/;
const DANGEROUS_URL_SCHEME = /^\s*(javascript|data|vbscript):/i;

function validateClientIslandField(
  blockName: string,
  field: "src" | "export",
  value: string,
  isUrl: boolean,
): void {
  if (typeof value !== "string" || value.length === 0) {
    throw BlockRegistrationError.invalidClientIsland({
      name: blockName,
      field,
      value: String(value),
    });
  }
  if (CLIENT_FIELD_FORBIDDEN_CHARS.test(value)) {
    throw BlockRegistrationError.invalidClientIsland({
      name: blockName,
      field,
      value,
    });
  }
  if (isUrl && DANGEROUS_URL_SCHEME.test(value)) {
    throw BlockRegistrationError.invalidClientIsland({
      name: blockName,
      field,
      value,
    });
  }
}

function freezeSupports<T>(supports: T | undefined): T | undefined {
  if (supports === undefined) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(supports as Record<string, unknown>)) {
    if (v !== null && typeof v === "object") {
      out[k] = Object.freeze({ ...(v as Record<string, unknown>) });
    } else {
      out[k] = v;
    }
  }
  return Object.freeze(out) as T;
}

function freezeArray<T>(
  items: readonly T[] | undefined,
): readonly T[] | undefined {
  return items ? Object.freeze([...items]) : undefined;
}

function freezeArrayOfObjects<T extends object>(
  items: readonly T[] | undefined,
): readonly T[] | undefined {
  return items
    ? Object.freeze(items.map((item) => Object.freeze({ ...item })))
    : undefined;
}
