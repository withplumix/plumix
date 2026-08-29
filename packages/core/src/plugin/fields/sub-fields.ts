import type { SubFieldContainer } from "./errors.js";
import type { MetaBoxField } from "./meta-box-field.js";
import { findUnknownConditionDriver } from "./condition.js";
import { FieldConfigError } from "./errors.js";

// Mirrors `META_FIELD_KEY_RE` in plugin/validation/meta-box-fields.ts.
// The top-level registrar validates field keys against this regex but
// doesn't recurse into composite children, so repeater / group enforce
// it locally — guards row/member-object shape and protects against
// duplicate-key clobber.
const SUBFIELD_KEY_RE = /^[a-zA-Z0-9_:-]+$/;

// `__proto__` / `constructor` / `prototype` match the key regex but
// writing them into a fresh object literal mutates the prototype chain.
// Reject at registration regardless of regex pass.
export const FORBIDDEN_FIELD_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

/**
 * Validate the child fields of a composite field (`repeater` / `group`)
 * at registration: key shape, prototype-pollution guard, uniqueness, and
 * that every condition names a sibling. Nested repeaters and groups are
 * permitted — each composite validates its own immediate children, so
 * arbitrarily deep nesting is covered as each builder is constructed.
 */
export function assertSubFields(
  container: SubFieldContainer,
  containerKey: string,
  subFields: readonly MetaBoxField[],
): void {
  const seen = new Set<string>();
  for (const sf of subFields) {
    if (FORBIDDEN_FIELD_KEYS.has(sf.key)) {
      throw FieldConfigError.subFieldKeyForbidden({
        container,
        containerKey,
        subFieldKey: sf.key,
      });
    }
    if (!SUBFIELD_KEY_RE.test(sf.key)) {
      throw FieldConfigError.subFieldKeyInvalid({
        container,
        containerKey,
        subFieldKey: sf.key,
        pattern: SUBFIELD_KEY_RE.source,
      });
    }
    if (seen.has(sf.key)) {
      throw FieldConfigError.subFieldDuplicate({
        container,
        containerKey,
        subFieldKey: sf.key,
      });
    }
    seen.add(sf.key);
  }
  const unknown = findUnknownConditionDriver(subFields, seen);
  if (unknown !== undefined) {
    throw FieldConfigError.subFieldConditionUnknownDriver({
      container,
      containerKey,
      subFieldKey: unknown.fieldKey,
      driverKey: unknown.driverKey,
    });
  }
}
