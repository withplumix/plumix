import type {
  MetaBoxFieldInput,
  MetaBoxFieldManifestEntry,
  MetaFieldValues,
} from "plumix/fields";
import type { Label } from "plumix/i18n";
import { isFieldVisible } from "plumix/fields";

/**
 * A break between two steps, written among the fields it separates:
 *
 *     fields: [text("name"), pageBreak("Your enquiry"), textarea("message")]
 *
 * It is an element of the flat field list rather than a level of
 * nesting, and that is the whole design. A form modelled as pages
 * containing fields makes every reader — the renderer, the submit
 * handler, the answers type, a condition naming a driver — walk two
 * levels to reach a field, and the authoring surface grows a page
 * concept it then has to carry everywhere. Here a form that never
 * breaks is a form with no breaks in its list, and the wizard is
 * something {@link visibleSteps} derives.
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
 * Where a form's field list was broken, as it survives onto the
 * definition. The break keeps an index into `fields` rather than the
 * fields themselves: the definition crosses to the island as JSON, and
 * a second copy of every field would be paid for on every page carrying
 * a form.
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
  // The breaks with the implicit first step in front of them: each entry
  // says where a step starts and carries the title of the step it opens,
  // and the next entry — or the end of the field list — says where that
  // step stops.
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
 * The steps a form shows for one set of answers — {@link declaredSteps}
 * with each step holding only what {@link isFieldVisible} admits.
 *
 * A step with nothing left to show is dropped rather than presented as
 * a page the visitor pages past: that is how a break placed at either
 * end of the list, or two written in a row, come to nothing, and it is
 * also what makes "skip the details page unless they said yes" fall out
 * of an ordinary condition. A form is always at least one step, so a
 * form whose every field is hidden still renders — as an empty one.
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
