import type {
  MetaBoxFieldInput,
  MetaBoxFieldManifestEntry,
} from "plumix/fields";
import type { Label } from "plumix/i18n";
import { compileMetaBoxFields, toMetaBoxFieldEntry } from "plumix/fields";

import { isSupportedInputType, SUPPORTED_INPUT_TYPES } from "./contract.js";
import { FormsError } from "./errors.js";

export interface FormDefinitionInput {
  readonly title?: Label;
  readonly submitLabel?: Label;
  /**
   * The form's questions, written with the same field builders meta boxes
   * use. Folded to the wire projection at definition time — the renderer,
   * the submit handler and the label snapshot all read that one shape.
   */
  readonly fields: readonly MetaBoxFieldInput[];
}

export interface FormDefinition {
  readonly slug: string;
  readonly title: Label | undefined;
  readonly submitLabel: Label | undefined;
  readonly fields: readonly MetaBoxFieldManifestEntry[];
}

/**
 * Declare a form. The slug is its identity — submissions carry it and
 * nothing else links them back, so renaming one orphans its history.
 */
export function defineForm(
  slug: string,
  input: FormDefinitionInput,
): FormDefinition {
  const fields = compileMetaBoxFields(input.fields).map(toMetaBoxFieldEntry);
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
  return Object.freeze({
    slug,
    title: input.title,
    submitLabel: input.submitLabel,
    fields,
  });
}
