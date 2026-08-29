/**
 * The names the server-rendered markup and the submit handler agree on.
 * They live under core's reserved `__plumix_` field-key prefix, which
 * `defineForm` rejects a form's own field for claiming.
 */
export const FORM_SLUG_FIELD = "__plumix_form";
export const HONEYPOT_FIELD = "__plumix_hp";
export const TOKEN_FIELD = "__plumix_token";
/**
 * The page the form was on, carried by the re-rendered form the
 * no-JavaScript path answers a rejected submit with. The document URL is
 * the endpoint by then, so the visitor's own `Referer` would send their
 * retry back to the endpoint rather than to the page.
 */
export const RETURN_FIELD = "__plumix_return";

/**
 * Where a wizard keeps how far the visitor has got, under the block
 * node's own id so two forms on one page cannot read each other's. In
 * session storage: it is the visitor's own half-finished answers, and it
 * belongs to the tab they are filling the form in rather than to the
 * browser.
 */
export const PROGRESS_KEY_PREFIX = "plumix-form:";

/** Mounted by `registerRoute` at `/_plumix/<pluginId><path>`. */
export const SUBMIT_ROUTE_PATH = "/submit";
export const SUBMIT_PATH = `/_plumix/forms${SUBMIT_ROUTE_PATH}`;
export const TOKEN_ROUTE_PATH = "/token";
export const TOKEN_PATH = `/_plumix/forms${TOKEN_ROUTE_PATH}`;

/**
 * The header core's CSRF gate looks for, which a plain `<form>` submit
 * cannot set — the reason the submit route is registered `formPost`. The
 * island sets it, so a scripted submission goes through the ordinary gate
 * rather than the exemption. Core does not publish the constant.
 */
export const CSRF_HEADER = "X-Plumix-Request";
export const CSRF_HEADER_VALUE = "1";

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
