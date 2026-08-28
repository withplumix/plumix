/**
 * The names the server-rendered markup and the submit handler agree on.
 * They live under core's reserved `__plumix_` field-key prefix, which
 * `defineForm` rejects a form's own field for claiming.
 */
export const FORM_SLUG_FIELD = "__plumix_form";
export const HONEYPOT_FIELD = "__plumix_hp";

/** Mounted by `registerRoute` at `/_plumix/<pluginId><path>`. */
export const SUBMIT_ROUTE_PATH = "/submit";
export const SUBMIT_PATH = `/_plumix/forms${SUBMIT_ROUTE_PATH}`;

/** The block the editor places. */
export const FORM_BLOCK_NAME = "forms/form";

/**
 * The one field type this plugin contributes to the host's field
 * vocabulary. Core deliberately has no `tel` — the roster stays the set
 * of types the admin renders itself — so the plugin registers the name,
 * ships the admin renderer under {@link TEL_FIELD_COMPONENT}, and
 * exports the `tel()` builder from `@plumix/plugin-forms/fields`.
 */
export const TEL_INPUT_TYPE = "tel";

export const TEL_FIELD_COMPONENT = "TelField";

/**
 * The field input types a form may declare. A form declaring anything
 * else fails at definition rather than rendering a control that cannot
 * carry the answer — repeater and group land in a later release.
 */
export const SUPPORTED_INPUT_TYPES = [
  "text",
  "textarea",
  "email",
  "url",
  TEL_INPUT_TYPE,
  "number",
  "date",
  "select",
  "toggle",
] as const;

export type SupportedInputType = (typeof SUPPORTED_INPUT_TYPES)[number];

export function isSupportedInputType(
  inputType: string,
): inputType is SupportedInputType {
  return (SUPPORTED_INPUT_TYPES as readonly string[]).includes(inputType);
}
