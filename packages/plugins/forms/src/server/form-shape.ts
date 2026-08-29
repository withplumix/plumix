import type { MetaBoxFieldManifestEntry } from "plumix/fields";
import type { Label } from "plumix/i18n";
import { labelSourceText } from "plumix/i18n";

import type { FormBinding, FormDefinition } from "../define-form.js";
import type { FormRegistry } from "../registry.js";
import type { FormSummary } from "../types.js";
import { declaredSteps } from "../steps.js";

/**
 * Every registered form, named. The registry is the whole answer: a form
 * is a value in the repository, so there is no table to read and no
 * manifest entry to keep in step with one.
 */
export function formSummaries(registry: FormRegistry): readonly FormSummary[] {
  return registry.list().map((form) => ({
    slug: form.slug,
    title: form.title === undefined ? form.slug : labelSourceText(form.title),
  }));
}

/** One question, as a reader outside the browser needs it. */
interface FormFieldShape {
  readonly key: string;
  readonly label: string;
  /** The control the visitor is given — `text`, `select`, `repeater`, … */
  readonly inputType: string;
  /** What an answer to it stores, which is what a submission carries. */
  readonly type: string;
  readonly required: boolean;
  readonly description?: string;
  readonly options?: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  /** Set on a choice field that stores an array rather than one value. */
  readonly multiple?: boolean;
  /**
   * Set on a field the form shows only under a condition. The rule itself
   * is not reported; that it exists is what explains a submission with
   * this answer missing — a hidden field is not asked, so a required one
   * is not enforced either.
   */
  readonly conditional?: true;
  /** A group's members, or a repeater row's fields. */
  readonly fields?: readonly FormFieldShape[];
}

interface FormStepShape {
  readonly title: string | null;
  /** The keys the step holds, in the order the form declares them. */
  readonly fields: readonly string[];
}

/**
 * A form as something reading it rather than filling it in needs it —
 * the questions, what they store, and where the wizard breaks.
 */
export interface FormShape {
  readonly slug: string;
  readonly title: string;
  readonly submitLabel: string | null;
  /** Whether an accepted submission is kept — see `store` on the definition. */
  readonly stores: boolean;
  /** What the form carries from the page it is placed on, if anything. */
  readonly binds: FormBinding | null;
  /**
   * How long a submission is kept before the nightly purge takes it, or
   * null when they are kept indefinitely. The definition spells that as
   * `retentionDays: 0`, which reads as "deleted immediately" to anyone
   * who has not read the docs for it.
   */
  readonly retentionDays: number | null;
  /** Whether the form is behind Turnstile. Never the site key, never the secret. */
  readonly captcha: boolean;
  readonly fields: readonly FormFieldShape[];
  readonly steps: readonly FormStepShape[];
}

function labelTextOrNull(label: Label | undefined): string | null {
  return label === undefined ? null : labelSourceText(label);
}

// An allowlist rather than a spread, so a property added to the manifest
// entry later cannot ride out to a caller unexamined.
function fieldShape(field: MetaBoxFieldManifestEntry): FormFieldShape {
  return {
    key: field.key,
    label: labelSourceText(field.label),
    inputType: field.inputType,
    type: field.type,
    required: field.required ?? false,
    ...(field.description === undefined
      ? {}
      : { description: labelSourceText(field.description) }),
    ...(field.options === undefined
      ? {}
      : {
          options: field.options.map((option) => ({
            value: option.value,
            label: labelSourceText(option.label),
          })),
        }),
    ...(field.multiple === undefined ? {} : { multiple: field.multiple }),
    ...(field.visibleWhen === undefined ? {} : { conditional: true as const }),
    ...(field.subFields === undefined
      ? {}
      : { fields: field.subFields.map(fieldShape) }),
  };
}

// By key, so a reader gets each question once and the steps say where it
// falls. Unconditioned: this describes the form, not what one visitor
// would be shown.
function stepShapes(form: FormDefinition): readonly FormStepShape[] {
  return declaredSteps(form).map((step) => ({
    title: labelTextOrNull(step.title),
    fields: step.fields.map((field) => field.key),
  }));
}

export function formShape(form: FormDefinition): FormShape {
  return {
    slug: form.slug,
    title: form.title === undefined ? form.slug : labelSourceText(form.title),
    submitLabel: labelTextOrNull(form.submitLabel),
    stores: form.store,
    binds: form.bind ?? null,
    retentionDays: form.retentionDays === 0 ? null : form.retentionDays,
    captcha: form.turnstile !== undefined,
    fields: form.fields.map(fieldShape),
    steps: stepShapes(form),
  };
}
