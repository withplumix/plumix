import type { InferStoredFields } from "plumix";
import type {
  MetaBoxFieldInput,
  MetaBoxFieldManifestEntry,
} from "plumix/fields";
import type { Label } from "plumix/i18n";
import {
  assertMetaBoxFields,
  compileMetaBoxFields,
  toMetaBoxFieldEntry,
} from "plumix/fields";

import { isSupportedInputType, SUPPORTED_INPUT_TYPES } from "./contract.js";
import { FormsError } from "./errors.js";

export interface FormDefinitionInput<
  Fields extends readonly MetaBoxFieldInput[],
> {
  readonly title?: Label;
  readonly submitLabel?: Label;
  /**
   * The form's questions, written with the same field builders meta boxes
   * use. Folded to the wire projection at definition time — the renderer,
   * the submit handler and the label snapshot all read that one shape.
   */
  readonly fields: Fields;
}

export interface FormDefinition<
  Fields extends readonly MetaBoxFieldInput[] = readonly MetaBoxFieldInput[],
> {
  readonly slug: string;
  readonly title: Label | undefined;
  readonly submitLabel: Label | undefined;
  readonly fields: readonly MetaBoxFieldManifestEntry[];
  /**
   * Phantom answers shape — type-level only, never assigned. Read it
   * through {@link FormAnswersOf} rather than off the value, which
   * carries nothing at this key.
   */
  readonly _answers: InferStoredFields<Fields>;
}

/**
 * What one submission of `F` stores: a property per field, typed by what
 * the field stores and `| undefined` unless `.required()`. Renaming a
 * field therefore breaks the build at every reader rather than in
 * production.
 *
 * It describes what the form declares, not what any one row holds: an
 * answer the visitor never gave is absent, and so is every field its own
 * condition hid — including a `.required()` one, which skips its
 * constraint precisely because it was hidden. Read a conditional field's
 * answer as though it were optional whatever its type says.
 */
export type FormAnswersOf<F extends FormDefinition> = F["_answers"];

/**
 * Declare a form. The slug is its identity — submissions carry it and
 * nothing else links them back, so renaming one orphans its history.
 */
export function defineForm<const Fields extends readonly MetaBoxFieldInput[]>(
  slug: string,
  input: FormDefinitionInput<Fields>,
): FormDefinition<Fields> {
  const compiled = compileMetaBoxFields(input.fields);
  // The checks a `register*MetaBox` call would have run. A form is not
  // registered, so nothing else runs them — and each one it skipped fails
  // silently at submit: a field keyed `__plumix_hp` shadows the honeypot
  // and files every answer as spam, a duplicate key drops one of the two
  // answers, and a condition naming a field the form does not declare
  // hides its own field for good.
  assertMetaBoxFields("form", slug, compiled);
  const fields = compiled.map(toMetaBoxFieldEntry);
  for (const field of fields) {
    if (!isSupportedInputType(field.inputType)) {
      throw FormsError.unsupportedFieldType({
        slug,
        key: field.key,
        inputType: field.inputType,
        supported: SUPPORTED_INPUT_TYPES,
      });
    }
  }
  // `_answers` is type-level only, so the value is everything but it and
  // the cast is what carries the inferred shape onto a form nobody can
  // read that key off at runtime.
  const definition: Omit<FormDefinition<Fields>, "_answers"> = {
    slug,
    title: input.title,
    submitLabel: input.submitLabel,
    fields,
  };
  return Object.freeze(definition) as FormDefinition<Fields>;
}
