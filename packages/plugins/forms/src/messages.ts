import type { Label } from "plumix/i18n";

/**
 * Every string this plugin shows a visitor, in one place.
 *
 * They are authored English rather than translated: a plugin has no
 * catalog at render time, so the public render path flattens a `Label` to
 * its source message (see `labelSourceText`). Collecting them here is
 * what makes the plugin's own catalog, when it lands, one file's work
 * rather than a hunt — which is also why the two that interpolate are
 * functions with named arguments and not concatenation spread across
 * call sites.
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

/** Shown when the submission never reached the server at all. */
export const UNREACHABLE: Label = {
  id: "plugin.forms.error.unreachable",
  message: "Your submission could not be sent. Please try again.",
};

/** What a step nobody titled is called, in the indicator and its heading. */
export const stepPositionMessage = (position: number, total: number): string =>
  `Step ${String(position)} of ${String(total)}`;

export const requiredMessage = (label: string): string =>
  `${label} is required.`;

export const emailMessage = (label: string): string =>
  `${label} must look like name@example.com.`;

export const urlMessage = (label: string): string =>
  `${label} must be a web address starting http:// or https://.`;

export const outOfRangeMessage = (
  label: string,
  min: number | string | undefined,
  max: number | string | undefined,
): string => {
  if (typeof min === "number" && typeof max === "number") {
    return `${label} must be between ${String(min)} and ${String(max)}.`;
  }
  return typeof min === "number"
    ? `${label} must be ${String(min)} or more.`
    : `${label} must be ${String(max ?? "")} or less.`;
};

export const tooLongMessage = (label: string, maxLength: number): string =>
  `${label} must be ${String(maxLength)} characters or fewer.`;

const entries = (count: number): string =>
  count === 1 ? "1 entry" : `${String(count)} entries`;

export const tooFewRowsMessage = (label: string, min: number): string =>
  `${label} needs at least ${entries(min)}.`;

export const tooManyRowsMessage = (label: string, max: number): string =>
  `${label} takes at most ${entries(max)}.`;

/** The heading over one repeater row, numbered as the visitor sees it. */
export const rowLegend = (label: string, index: number): string =>
  `${label} ${String(index + 1)}`;

export const removeRowLabel = (label: string, index: number): string =>
  `Remove ${rowLegend(label, index)}`;

export const ADD_ROW: Label = {
  id: "plugin.forms.repeater.add",
  message: "Add another",
};

export const REMOVE_ROW: Label = {
  id: "plugin.forms.repeater.remove",
  message: "Remove",
};
