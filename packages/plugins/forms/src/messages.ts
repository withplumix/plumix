import type { Messages } from "@lingui/core";
import type { Label, MessageDescriptor } from "plumix/i18n";
import { setupI18n } from "@lingui/core";

import { messages } from "@plumix/plugin-forms/locales/en";

import { SOURCE_LOCALE } from "./contract.js";

/**
 * The source locale's compiled catalog, resolved through this package's
 * own `./locales/*` subpath the way core's admin bar does. It has to be
 * the compiled form, not the descriptors' own `message`: Lingui installs
 * the parser that would read a raw ICU string only when `NODE_ENV` is not
 * `"production"`, and both ends that render these — the worker and the
 * island — are built with that folded to `"production"`. Compiled, the
 * ICU is already an array and no parser ships at all.
 */
const source = setupI18n({
  locale: SOURCE_LOCALE,
  // `plumix-compile-catalogs` emits a deliberately loose `.d.mts` stub
  // that predates any Lingui type; the file it describes is `lingui
  // compile` output, which is `Messages` by construction.
  messages: { [SOURCE_LOCALE]: messages as Messages },
});

type MessageValues = Readonly<Record<string, string | number | undefined>>;

function formatMessage(
  descriptor: MessageDescriptor,
  values: MessageValues,
): string {
  return source._(descriptor.id, values, { message: descriptor.message });
}

/**
 * Every string this plugin shows a visitor, in one place.
 *
 * They render as authored English whatever the locale: a plugin has no
 * catalog at render time, so the public render path flattens a `Label` to
 * its source message (see `labelSourceText`). What the ids buy is that a
 * translator can reach them at all.
 */
export const SUBMIT_LABEL: Label = {
  id: "plugin.forms.submit",
  message: "Submit",
};

export const SUMMARY_TITLE: Label = {
  id: "plugin.forms.summary.title",
  message: "There is a problem",
};

export const CONFIRMATION: Label = {
  id: "plugin.forms.confirmation",
  message: "Thanks — your submission has been received.",
};

/** Moves a wizard on; only the last step carries the submit button. */
export const NEXT_LABEL: Label = {
  id: "plugin.forms.next",
  message: "Next",
};

export const BACK_LABEL: Label = {
  id: "plugin.forms.back",
  message: "Back",
};

/**
 * What a visitor is told when a captcha did not clear: they got it wrong,
 * the challenge had already been spent, or the check could not be made at
 * all. One message for all three — none of them is the visitor's to tell
 * apart, and every one is answered by solving it again.
 */
export const CAPTCHA_FAILED: Label = {
  id: "plugin.forms.error.captcha",
  message: "We could not confirm you are not a robot. Please try again.",
};

/**
 * The widget is drawn by a script, so a guarded form is the one place
 * this plugin's no-JavaScript path stops. Say so where the challenge
 * would have been, rather than leaving a visitor at a box that never
 * fills in and a submit button that will always be refused.
 */
export const CAPTCHA_NEEDS_JS: Label = {
  id: "plugin.forms.captcha.needs_js",
  message: "This form needs JavaScript enabled to check you are not a robot.",
};

/** Shown when the submission never reached the server at all. */
export const UNREACHABLE: Label = {
  id: "plugin.forms.error.unreachable",
  message: "Your submission could not be sent. Please try again.",
};

/** What a step nobody titled is called, in the indicator and its heading. */
const STEP_POSITION: MessageDescriptor = {
  id: "plugin.forms.step.position",
  message: "Step {position} of {total}",
  comment:
    "position/total: the 1-based step number and how many steps there are",
};

export const stepPositionMessage = (position: number, total: number): string =>
  formatMessage(STEP_POSITION, { position, total });

const REQUIRED: MessageDescriptor = {
  id: "plugin.forms.error.required",
  message: "{label} is required.",
};

export const requiredMessage = (label: string): string =>
  formatMessage(REQUIRED, { label });

const EMAIL: MessageDescriptor = {
  id: "plugin.forms.error.email",
  message: "{label} must look like name@example.com.",
};

export const emailMessage = (label: string): string =>
  formatMessage(EMAIL, { label });

const INVALID_URL: MessageDescriptor = {
  id: "plugin.forms.error.url",
  message: "{label} must be a web address starting http:// or https://.",
};

export const urlMessage = (label: string): string =>
  formatMessage(INVALID_URL, { label });

/**
 * One message for all three bounds rather than three ids: a translator
 * seeing them apart cannot tell that they are the same sentence with a
 * different tail, and some languages inflect the whole clause on which
 * bound is present.
 */
const OUT_OF_RANGE: MessageDescriptor = {
  id: "plugin.forms.error.range",
  message:
    "{label} must be {bound, select, range {between {min} and {max}} min {{min} or more} other {{max} or less}}.",
  comment: "bound: which of the field's limits are set — range, min or max",
};

export const outOfRangeMessage = (
  label: string,
  min: number | string | undefined,
  max: number | string | undefined,
): string => {
  let bound = "max";
  if (typeof min === "number")
    bound = typeof max === "number" ? "range" : "min";
  return formatMessage(OUT_OF_RANGE, { label, bound, min, max });
};

const TOO_LONG: MessageDescriptor = {
  id: "plugin.forms.error.tooLong",
  message: "{label} must be {max} characters or fewer.",
  comment: "max: the field's maximum length in characters",
};

export const tooLongMessage = (label: string, maxLength: number): string =>
  formatMessage(TOO_LONG, { label, max: maxLength });

const TOO_FEW_ROWS: MessageDescriptor = {
  id: "plugin.forms.error.tooFewRows",
  message:
    "{label} needs at least {count, plural, one {# entry} other {# entries}}.",
  comment: "count: the fewest rows the repeater accepts",
};

export const tooFewRowsMessage = (label: string, min: number): string =>
  formatMessage(TOO_FEW_ROWS, { label, count: min });

const TOO_MANY_ROWS: MessageDescriptor = {
  id: "plugin.forms.error.tooManyRows",
  message:
    "{label} takes at most {count, plural, one {# entry} other {# entries}}.",
  comment: "count: the most rows the repeater accepts",
};

export const tooManyRowsMessage = (label: string, max: number): string =>
  formatMessage(TOO_MANY_ROWS, { label, count: max });

/** The heading over one repeater row, numbered as the visitor sees it. */
const ROW_LEGEND: MessageDescriptor = {
  id: "plugin.forms.repeater.rowLegend",
  message: "{label} {number}",
  comment: "number: the row's 1-based position as the visitor sees it",
};

export const rowLegend = (label: string, index: number): string =>
  formatMessage(ROW_LEGEND, { label, number: index + 1 });

/**
 * Authored whole rather than composed from `ROW_LEGEND`, so a translator
 * sees the sentence a screen reader will read out and can put the pieces
 * in whatever order the language wants.
 */
const REMOVE_ROW_ARIA: MessageDescriptor = {
  id: "plugin.forms.repeater.removeRow",
  message: "Remove {label} {number}",
  comment: "number: the row's 1-based position as the visitor sees it",
};

export const removeRowLabel = (label: string, index: number): string =>
  formatMessage(REMOVE_ROW_ARIA, { label, number: index + 1 });

export const ADD_ROW: Label = {
  id: "plugin.forms.repeater.add",
  message: "Add another",
};

export const REMOVE_ROW: Label = {
  id: "plugin.forms.repeater.remove",
  message: "Remove",
};
