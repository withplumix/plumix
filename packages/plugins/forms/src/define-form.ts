import type { EnvInput, InferStoredFields, JsonValue } from "plumix";
import type {
  MetaBoxFieldInput,
  MetaBoxFieldManifestEntry,
} from "plumix/fields";
import type { Label } from "plumix/i18n";
import type { AppContext } from "plumix/plugin";
import {
  assertMetaBoxFields,
  compileMetaBoxFields,
  toMetaBoxFieldEntry,
} from "plumix/fields";

import type { StoredSubmission } from "./db/schema.js";
import type { FormPageBreak, FormPageBreakEntry } from "./steps.js";
import type {
  BoundType,
  FormBound,
  FormFieldError,
  FormLabelSnapshot,
} from "./types.js";
import { isSupportedInputType, SUPPORTED_INPUT_TYPES } from "./contract.js";
import { FormsError } from "./errors.js";
import { fieldName } from "./paths.js";
import { isPageBreak } from "./steps.js";

/**
 * What may be written in a form's field list: a field, or a
 * {@link FormPageBreak} separating the step before it from the step
 * after.
 */
export type FormElementInput = MetaBoxFieldInput | FormPageBreak;

/**
 * One kind, never "whatever this page is": a term id would be read as an
 * entry by a handler expecting one.
 */
export type FormBinding = BoundType;

/**
 * `secret?: never` stops a whole {@link TurnstileConfig} passing as this
 * and serializing the secret into the page.
 */
export interface TurnstileWire {
  readonly siteKey: string;
  readonly secret?: never;
}

/**
 * The resolved `secret` is memoized per isolate, so a rotated secret
 * applies when the isolate recycles.
 */
export interface TurnstileConfig {
  readonly siteKey: string;
  readonly secret: EnvInput<string>;
}

/** `Extract` drops page breaks, which carry no answer. */
type FormFieldInputs<Elements extends readonly FormElementInput[]> = Extract<
  Elements[number],
  MetaBoxFieldInput
>[];

/**
 * Values allow `undefined` so `InferStoredFields` is assignable here,
 * keeping `defineForm`'s widening a single assertion.
 */
type AnyAnswers = Readonly<Record<string, JsonValue | undefined>>;

/**
 * `answers` is the object that gets stored, not a copy: mutating it
 * despite `readonly` changes the row.
 */
export interface FormValidateEvent<Answers> {
  readonly answers: Answers;
  /** Also `null` when the page isn't the kind the form binds. */
  readonly bound: FormBound | null;
  readonly ctx: AppContext;
}

export interface FormSubmitEvent<Answers> extends FormValidateEvent<Answers> {
  /** What each field and option was called, for {@link formatSubmission}. */
  readonly labels: FormLabelSnapshot;
  /**
   * The row, already written — `null` when the form declared `store: false`.
   */
  readonly submission: StoredSubmission | null;
}

/** Runs after field-level rules pass. Name each error by its field. */
export type FormValidator<Answers = AnyAnswers> = (
  event: FormValidateEvent<Answers>,
) =>
  readonly FormFieldError[] | void | Promise<readonly FormFieldError[] | void>;

/** What the form does with a submission it has accepted. */
export type FormHandler<Answers = AnyAnswers> = (
  event: FormSubmitEvent<Answers>,
) => void | Promise<void>;

export interface FormDefinitionInput<
  Fields extends readonly FormElementInput[],
> {
  readonly title?: Label;
  readonly submitLabel?: Label;
  /** A `pageBreak()` among them makes a wizard when JavaScript runs. */
  readonly fields: Fields;
  /** Resolved and signed at render; a page of another kind carries nothing. */
  readonly bind?: FormBinding;
  /**
   * Server-only, after field-level rules but before the spam floor, so it
   * also runs for trapped submissions.
   */
  readonly validate?: FormValidator<InferStoredFields<FormFieldInputs<Fields>>>;
  /** Runs after the submission is stored; a throw doesn't lose it. */
  readonly onSubmit?: FormHandler<InferStoredFields<FormFieldInputs<Fields>>>;
  /**
   * Off still validates, applies the spam floor and runs `onSubmit`.
   * Throws when off without an `onSubmit`, which would discard everything.
   */
  readonly store?: boolean;
  /**
   * Deleted nightly whatever their status. Absent defers to the site's
   * `retentionDays`; `0` keeps them forever regardless.
   */
  readonly retentionDays?: number;
  /** The form then requires JavaScript to complete. */
  readonly turnstile?: TurnstileConfig;
}

/** Carries no callbacks, so no server-only closure reaches the client. */
export interface FormWire {
  readonly slug: string;
  readonly title: Label | undefined;
  readonly submitLabel: Label | undefined;
  readonly fields: readonly MetaBoxFieldManifestEntry[];
  /** Empty for a form with no page break; only the island pages through. */
  readonly pageBreaks: readonly FormPageBreakEntry[];
  /** A guarded form's site key — see {@link TurnstileWire}. */
  readonly turnstile: TurnstileWire | undefined;
}

export interface FormDefinition<
  Fields extends readonly FormElementInput[] = readonly FormElementInput[],
> extends Omit<FormWire, "turnstile"> {
  /**
   * Typed against widened answers so the registry can hold any form;
   * {@link FormDefinitionInput} carries the narrow types.
   */
  readonly validate: FormValidator | undefined;
  readonly onSubmit: FormHandler | undefined;
  readonly store: boolean;
  readonly bind: FormBinding | undefined;
  /**
   * Days before a submission is purged; `0` keeps it indefinitely, and
   * `undefined` leaves the period for the site to answer — read it
   * through the registry's `retentionDaysFor` rather than off the form.
   */
  readonly retentionDays: number | undefined;
  /** What the server holds, secret and all — see {@link TurnstileWire}. */
  readonly turnstile: TurnstileConfig | undefined;
  /**
   * Phantom answers shape — type-level only, never assigned. Read it
   * through {@link FormAnswersOf} rather than off the value, which
   * carries nothing at this key.
   */
  readonly _answers: InferStoredFields<FormFieldInputs<Fields>>;
}

/**
 * A field its condition hid is absent even if `.required()`, so treat a
 * conditional field as optional whatever its type says.
 */
export type FormAnswersOf<F extends FormDefinition> = F["_answers"];

function assertSupportedFields(
  slug: string,
  fields: readonly MetaBoxFieldManifestEntry[],
  parent: string | undefined,
): void {
  for (const field of fields) {
    const name = fieldName(parent, field.key);
    if (!isSupportedInputType(field.inputType)) {
      throw FormsError.unsupportedFieldType({
        slug,
        key: name,
        inputType: field.inputType,
        supported: SUPPORTED_INPUT_TYPES,
      });
    }
    assertSupportedFields(slug, field.subFields ?? [], name);
  }
}

export function isRetentionPeriod(days: number): boolean {
  return Number.isInteger(days) && days >= 0;
}

/** Renaming the slug orphans its submissions: nothing else links them back. */
export function defineForm<const Fields extends readonly FormElementInput[]>(
  slug: string,
  input: FormDefinitionInput<Fields>,
): FormDefinition<Fields> {
  // Each break records how many fields precede it: the next step's start.
  const declared: MetaBoxFieldInput[] = [];
  const pageBreaks: FormPageBreakEntry[] = [];
  for (const element of input.fields) {
    if (isPageBreak(element)) {
      pageBreaks.push({ startIndex: declared.length, title: element.title });
    } else {
      declared.push(element);
    }
  }
  const compiled = compileMetaBoxFields(declared);
  // A form isn't registered as a meta box, so nothing else runs these, and
  // each skipped check would fail silently at submit.
  assertMetaBoxFields("form", slug, compiled);
  const fields = compiled.map(toMetaBoxFieldEntry);
  assertSupportedFields(slug, fields, undefined);
  const store = input.store ?? true;
  if (!store && !input.onSubmit) throw FormsError.storesNothing({ slug });
  const retentionDays = input.retentionDays;
  if (retentionDays !== undefined && !isRetentionPeriod(retentionDays)) {
    throw FormsError.invalidRetention({ slug, retentionDays });
  }
  // `_answers` is type-level only; the cast carries the inferred shape.
  const definition: Omit<FormDefinition<Fields>, "_answers"> = {
    slug,
    title: input.title,
    submitLabel: input.submitLabel,
    fields,
    pageBreaks,
    // The widening the interface above describes: the author's callbacks
    // are typed against this form's answers, the stored ones against any.
    validate: input.validate as FormValidator | undefined,
    onSubmit: input.onSubmit as FormHandler | undefined,
    store,
    bind: input.bind,
    retentionDays,
    turnstile: input.turnstile,
  };
  return Object.freeze(definition) as FormDefinition<Fields>;
}

/** The form as the island receives it — see {@link FormWire}. */
export function toFormWire(form: FormDefinition): FormWire {
  return {
    slug: form.slug,
    title: form.title,
    submitLabel: form.submitLabel,
    fields: form.fields,
    pageBreaks: form.pageBreaks,
    // Rebuilt rather than passed through, so a property added to the
    // configuration later does not reach a browser by default.
    turnstile:
      form.turnstile === undefined
        ? undefined
        : { siteKey: form.turnstile.siteKey },
  };
}
