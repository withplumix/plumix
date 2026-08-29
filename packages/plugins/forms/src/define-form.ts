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

import type { FormSubmission } from "./db/schema.js";
import type { FormPageBreak, FormPageBreakEntry } from "./steps.js";
import type { FormFieldError, FormLabelSnapshot } from "./types.js";
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
 * What a form carries from the page it is placed on. `"entry"` binds the
 * entry whose page is being rendered — a subscribe form on a school's
 * page knows which school — and nothing else today, though the shape is
 * a union so a term or an author can join it without a breaking change.
 */
export type FormBinding = "entry";

/**
 * The half of a Turnstile configuration a visitor's browser is given.
 * The site key is public by design — the widget renders from it, and it
 * identifies the site to Cloudflare rather than authenticating it.
 *
 * `secret?: never` is the guard, not decoration: without it a whole
 * {@link TurnstileConfig} is structurally a `TurnstileWire`, and any
 * caller handing a {@link FormDefinition} to a client boundary would
 * serialize the secret into the page. With it, only what
 * {@link toFormWire} built can go there, and the compiler says so.
 */
export interface TurnstileWire {
  readonly siteKey: string;
  readonly secret?: never;
}

/**
 * Cloudflare Turnstile, opted into by one form — see the `turnstile`
 * slot on {@link FormDefinitionInput}.
 *
 * `secret` takes core's environment-input union, so on Workers — where
 * the config module is evaluated before any request and secrets arrive
 * on the per-request `env` — it is written `(env) => env.MY_SECRET`.
 * Resolution is memoized per isolate, so a rotated secret is picked up
 * when the isolate recycles rather than on the next request.
 */
export interface TurnstileConfig {
  readonly siteKey: string;
  readonly secret: EnvInput<string>;
}

// The fields among a form's elements, at the type level — what the
// answers shape is inferred from. A page break carries no answer and is
// not a `MetaBoxFieldInput`, so `Extract` drops it.
type FormFieldInputs<Elements extends readonly FormElementInput[]> = Extract<
  Elements[number],
  MetaBoxFieldInput
>[];

/**
 * The answers a callback written against no particular form sees, and
 * what the two callback types default to. Values are optional because a
 * form's own inferred answers are — which is what keeps the widening in
 * `defineForm` a single assertion rather than one through `unknown`:
 * `InferStoredFields` is assignable to this, and not to `FormAnswers`,
 * whose values exclude `undefined`. The assertion is still an assertion:
 * `strictFunctionTypes` checks a callback's parameter contravariantly,
 * so it cannot be dropped.
 */
type AnyAnswers = Readonly<Record<string, JsonValue | undefined>>;

/**
 * What a form's own `validate` and `onSubmit` are handed. `answers` is
 * the payload as it will be stored — the fields the submitted answers
 * left visible, in the shape each field stores — so a callback reads the
 * same values the row does rather than raw strings off the body. It is
 * the object that goes on to be stored, not a copy: `readonly` is a
 * compile-time promise, and a callback that mutates it changes the row.
 */
export interface FormValidateEvent<Answers> {
  readonly answers: Answers;
  /**
   * The entry the form was placed on, for a form that declared
   * `bind: "entry"` and was rendered on one — the whole point of binding
   * is that a handler can act on it. `null` for a form that binds
   * nothing, and for one that binds but was rendered somewhere with no
   * entry to bind.
   */
  readonly entryId: number | null;
  readonly ctx: AppContext;
}

export interface FormSubmitEvent<Answers> extends FormValidateEvent<Answers> {
  /** What each field and option was called, for {@link formatSubmission}. */
  readonly labels: FormLabelSnapshot;
  /** The row, already written — `null` when the form declared `store: false`. */
  readonly submission: FormSubmission | null;
}

/**
 * A form's own check, run once every field-level rule has passed. The
 * errors it returns are answered exactly like the built-in ones, so name
 * each against the field that produced it.
 */
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
  /**
   * The form's questions, written with the same field builders meta boxes
   * use. Folded to the wire projection at definition time — the renderer,
   * the submit handler and the label snapshot all read that one shape.
   * A `pageBreak()` written among them turns the form into a wizard for
   * a visitor whose browser runs the island.
   */
  readonly fields: Fields;
  /**
   * What this form carries from the page it is placed on. Declared here;
   * resolved for you at render, so nothing has to thread an entry id
   * through the block, the template or the theme. The resolved value is
   * signed and stored in its own column, and a page the binding does not
   * apply to — a front page, an archive — simply carries nothing.
   */
  readonly bind?: FormBinding;
  /**
   * The checks the field builders cannot express — a date that has to be
   * in the future, an address already on the list. Runs on the server
   * only, after every field-level rule has passed, so it reads answers
   * that are already the right shape — but before the spam floor, so it
   * runs for trapped submissions too.
   */
  readonly validate?: FormValidator<InferStoredFields<FormFieldInputs<Fields>>>;
  /**
   * What to do with an accepted submission: send the notification, call
   * the CRM, write the developer's own row. Runs once the submission is
   * stored — see `runHandler` for what a throw here costs, which is
   * deliberately not the submission.
   */
  readonly onSubmit?: FormHandler<InferStoredFields<FormFieldInputs<Fields>>>;
  /**
   * Whether to store the submission. On by default: with no notification
   * subsystem, the stored row is the reliability story. Turn it off for a
   * form that owns its own destination — one whose `onSubmit` writes to
   * your table — and it still validates, still meets the spam floor, and
   * still runs its handler, with nothing left in `form_submissions`.
   * Turning it off without an `onSubmit` throws: that form would discard
   * every submission it accepted.
   */
  readonly store?: boolean;
  /**
   * How many days this form's submissions are kept before the nightly
   * task deletes them, whatever status they are under. Zero — what a
   * form declaring nothing takes — keeps them indefinitely, which is the
   * only default that cannot lose an enquiry nobody asked to lose.
   *
   * It is the answer to holding personal data forever because nobody
   * chose a number: a form asking for a phone number and an address
   * declares how long the site is entitled to them, beside the fields
   * that collect them, in the repository that deploys them.
   */
  readonly retentionDays?: number;
  /**
   * Put Cloudflare Turnstile in front of this form's submit button — for
   * the one form actually being attacked, rather than for every form on
   * the site. The honeypot and timing floor every form already meets are
   * unaffected, and a form that declares nothing here loads nothing from
   * Cloudflare. See {@link TurnstileConfig}.
   *
   * The widget needs JavaScript, so a form that declares one can only be
   * completed with it enabled — the one place this plugin's no-script
   * path stops, and the visitor is told so rather than left at a box
   * that never fills in.
   */
  readonly turnstile?: TurnstileConfig;
}

/**
 * The half of a form the browser is given: what the markup renders from,
 * and nothing else. The island's props cross the wire as JSON, which
 * would drop a callback silently — so the callbacks are not on this
 * shape at all, and no server-only closure is handed to a client
 * boundary in the first place.
 */
export interface FormWire {
  readonly slug: string;
  readonly title: Label | undefined;
  readonly submitLabel: Label | undefined;
  readonly fields: readonly MetaBoxFieldManifestEntry[];
  /**
   * Where the field list was broken into steps. Empty for a form
   * declaring no page break — which is every form until one does, and
   * why nothing downstream branches on whether a form is a wizard. It is
   * on the wire because the wizard is the browser's: the server renders
   * every step as one form, and the island is what pages through them.
   */
  readonly pageBreaks: readonly FormPageBreakEntry[];
  /** A guarded form's site key — see {@link TurnstileWire}. */
  readonly turnstile: TurnstileWire | undefined;
}

export interface FormDefinition<
  Fields extends readonly FormElementInput[] = readonly FormElementInput[],
> extends Omit<FormWire, "turnstile"> {
  /**
   * The callbacks are held against the widened answers rather than this
   * form's own, so a form is still a `FormDefinition` once the
   * registry has widened it away from its fields. The author writes them
   * against the narrow shape — {@link FormDefinitionInput} is where the
   * inference lives — and `defineForm` widens on the way in.
   */
  readonly validate: FormValidator | undefined;
  readonly onSubmit: FormHandler | undefined;
  readonly store: boolean;
  readonly bind: FormBinding | undefined;
  /** Days before a submission is purged; `0` keeps it indefinitely. */
  readonly retentionDays: number;
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
 * Every field a form declares is one this release can render and store —
 * a group's members and a repeater's row schema included, since they
 * reach a visitor as controls exactly as a top-level field does. Named by
 * the wire name so the refusal points at the field inside the container
 * rather than at a bare key two levels down.
 */
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

/**
 * Declare a form. The slug is its identity — submissions carry it and
 * nothing else links them back, so renaming one orphans its history.
 */
export function defineForm<const Fields extends readonly FormElementInput[]>(
  slug: string,
  input: FormDefinitionInput<Fields>,
): FormDefinition<Fields> {
  // The one pass that flattens the authored list: fields keep their
  // order, and each break records how many of them precede it — which is
  // the index the step after it starts at.
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
  // The checks a `register*MetaBox` call would have run. A form is not
  // registered, so nothing else runs them — and each one it skipped fails
  // silently at submit: a field keyed `__plumix_hp` shadows the honeypot
  // and files every answer as spam, a duplicate key drops one of the two
  // answers, and a condition naming a field the form does not declare
  // hides its own field for good.
  assertMetaBoxFields("form", slug, compiled);
  const fields = compiled.map(toMetaBoxFieldEntry);
  assertSupportedFields(slug, fields, undefined);
  const store = input.store ?? true;
  if (!store && !input.onSubmit) throw FormsError.storesNothing({ slug });
  const retentionDays = input.retentionDays ?? 0;
  if (!Number.isInteger(retentionDays) || retentionDays < 0) {
    throw FormsError.invalidRetention({ slug, retentionDays });
  }
  // `_answers` is type-level only, so the value is everything but it and
  // the cast is what carries the inferred shape onto a form nobody can
  // read that key off at runtime.
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
