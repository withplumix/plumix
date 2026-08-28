/**
 * The names the server-rendered markup and the submit handler agree on.
 * They live under core's reserved `__plumix_` field-key prefix, which a
 * form's own field can never claim.
 */
export const FORM_SLUG_FIELD = "__plumix_form";
export const HONEYPOT_FIELD = "__plumix_hp";

/** Mounted by `registerRoute` at `/_plumix/<pluginId><path>`. */
export const SUBMIT_ROUTE_PATH = "/submit";
export const SUBMIT_PATH = `/_plumix/forms${SUBMIT_ROUTE_PATH}`;

/** The block the editor places. */
export const FORM_BLOCK_NAME = "forms/form";

/**
 * The field input types this release renders. The roster widens with the
 * rest of the field vocabulary; until then a form declaring anything else
 * fails at definition rather than rendering a control that cannot carry
 * the answer.
 */
export const SUPPORTED_INPUT_TYPES = ["text", "email"] as const;

export type SupportedInputType = (typeof SUPPORTED_INPUT_TYPES)[number];

export function isSupportedInputType(
  inputType: string,
): inputType is SupportedInputType {
  return (SUPPORTED_INPUT_TYPES as readonly string[]).includes(inputType);
}
