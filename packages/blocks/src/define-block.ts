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
    schema: spec.schema,
    component: spec.component,
    editor: spec.editor,
    client: spec.client,
    legacyAliases: freezeArray(spec.legacyAliases),
    keyboardShortcuts: freezeArrayOfObjects(spec.keyboardShortcuts),
    markdownShortcuts: freezeArrayOfObjects(spec.markdownShortcuts),
    parsePaste: freezeArrayOfObjects(spec.parsePaste),
  });
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
