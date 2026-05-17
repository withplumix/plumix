import type { BlockAttributeSchema, BlockSpec } from "./types.js";
import { BlockRegistrationError } from "./errors.js";
import { KEYBOARD_SHORTCUT_PATTERN } from "./keyboard-shortcut.js";

const BLOCK_NAME_PATTERN = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/;
// Variation slugs may start with a digit because layout variations
// commonly encode ratios (`50-50`, `33-67`, `25-50-25`). Hyphens
// inside the slug are still required to be flanked by alphanumerics.
const VARIATION_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

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
  if (spec.variations) {
    const seenSlugs = new Set<string>();
    for (const variation of spec.variations) {
      if (!VARIATION_NAME_PATTERN.test(variation.name)) {
        throw BlockRegistrationError.invalidVariationName({
          name: spec.name,
          variationName: variation.name,
        });
      }
      if (seenSlugs.has(variation.name)) {
        throw BlockRegistrationError.duplicateVariationName({
          name: spec.name,
          variationName: variation.name,
        });
      }
      seenSlugs.add(variation.name);
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
    variations: freezeVariations(spec.variations),
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

function freezeVariations<T>(
  variations: readonly T[] | undefined,
): readonly T[] | undefined {
  if (!variations) return undefined;
  return Object.freeze(
    variations.map((variation) =>
      Object.freeze({
        ...(variation as Record<string, unknown>),
        ...(hasInnerBlocks(variation) && {
          innerBlocks: freezeInnerBlocks(variation.innerBlocks),
        }),
      }),
    ),
  ) as readonly T[];
}

interface InnerBlockShape {
  readonly name: string;
  readonly attributes?: Readonly<Record<string, unknown>>;
  readonly innerBlocks?: readonly InnerBlockShape[];
}

function hasInnerBlocks(
  v: unknown,
): v is { readonly innerBlocks: readonly InnerBlockShape[] } {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray((v as { innerBlocks?: unknown }).innerBlocks)
  );
}

/**
 * Deep-freezes `innerBlocks` recursively so a plugin holding a registry
 * reference can't mutate the templated children that `<SlashMenu>` will
 * materialise on every variation insert. Without this, freezing only
 * stops at the variation object and the template arrays under it stay
 * writeable — a misbehaving plugin could rewrite "core/column" to
 * "core/evil" after registration.
 */
function freezeInnerBlocks(
  inners: readonly InnerBlockShape[],
): readonly InnerBlockShape[] {
  return Object.freeze(
    inners.map((inner) =>
      Object.freeze({
        ...inner,
        ...(inner.attributes !== undefined && {
          attributes: Object.freeze({ ...inner.attributes }),
        }),
        ...(inner.innerBlocks !== undefined && {
          innerBlocks: freezeInnerBlocks(inner.innerBlocks),
        }),
      }),
    ),
  );
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
