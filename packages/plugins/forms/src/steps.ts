import type {
  MetaBoxFieldInput,
  MetaBoxFieldManifestEntry,
  MetaFieldValues,
} from "plumix/fields";
import type { Label } from "plumix/i18n";
import { isFieldVisible } from "plumix/fields";

/**
 * An element of the flat field list, not a level of nesting, so no reader
 * has to walk pages to reach a field.
 */
export interface FormPageBreak {
  readonly pageBreak: true;
  readonly title: Label | undefined;
}

/** Break the field list here, optionally naming the step that follows. */
export function pageBreak(title?: Label): FormPageBreak {
  return Object.freeze({ pageBreak: true as const, title });
}

export function isPageBreak(
  element: MetaBoxFieldInput | FormPageBreak,
): element is FormPageBreak {
  return "pageBreak" in element;
}

/**
 * An index, not the fields themselves, so the island's JSON doesn't carry
 * every field twice.
 */
export interface FormPageBreakEntry {
  /** Index in `fields` the step following this break starts at. */
  readonly startIndex: number;
  readonly title: Label | undefined;
}

/** The parts of a form a wizard is derived from. */
export interface SteppedForm {
  readonly fields: readonly MetaBoxFieldManifestEntry[];
  readonly pageBreaks: readonly FormPageBreakEntry[];
}

export interface FormStep {
  readonly title: Label | undefined;
  readonly fields: readonly MetaBoxFieldManifestEntry[];
}

/** Every step the form declares, before any condition narrows one. */
export function declaredSteps(form: SteppedForm): readonly FormStep[] {
  const opens: readonly FormPageBreakEntry[] = [
    { startIndex: 0, title: undefined },
    ...form.pageBreaks,
  ];
  return opens.map((entry, position) => ({
    title: entry.title,
    fields: form.fields.slice(
      entry.startIndex,
      opens[position + 1]?.startIndex ?? form.fields.length,
    ),
  }));
}

/**
 * Empty steps are dropped, so conditions can skip a step. Always at least
 * one step, even if every field is hidden.
 */
export function visibleSteps(
  form: SteppedForm,
  values: MetaFieldValues,
): readonly FormStep[] {
  const steps = declaredSteps(form).map((step) => ({
    title: step.title,
    fields: step.fields.filter((field) => isFieldVisible(field, values)),
  }));
  const shown = steps.filter((step) => step.fields.length > 0);
  return shown.length > 0 ? shown : steps.slice(0, 1);
}
