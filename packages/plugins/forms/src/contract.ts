/**
 * The names the server-rendered markup and the submit handler agree on.
 * They live under core's reserved `__plumix_` field-key prefix, which
 * `defineForm` rejects a form's own field for claiming.
 */
export const FORM_SLUG_FIELD = "__plumix_form";
export const HONEYPOT_FIELD = "__plumix_hp";
export const TOKEN_FIELD = "__plumix_token";
/** The bound value never appears unsigned in the markup. */
export const BOUND_FIELD = "__plumix_bound";
/**
 * Needed on a no-JavaScript retry, where `Referer` is the endpoint rather
 * than the page.
 */
export const RETURN_FIELD = "__plumix_return";

/** Session storage, so progress belongs to the tab, not the browser. */
export const PROGRESS_KEY_PREFIX = "plumix-form:";

/** Mounted by `registerRoute` at `/_plumix/<pluginId><path>`. */
export const SUBMIT_ROUTE_PATH = "/submit";
export const SUBMIT_PATH = `/_plumix/forms${SUBMIT_ROUTE_PATH}`;
export const TOKEN_ROUTE_PATH = "/token";
export const TOKEN_PATH = `/_plumix/forms${TOKEN_ROUTE_PATH}`;
/**
 * Where the inbox's export links point. A GET carrying the inbox's own
 * filters, so a plain link downloads the file — see `exportHandler`.
 */
export const EXPORT_ROUTE_PATH = "/export";
export const EXPORT_PATH = `/_plumix/forms${EXPORT_ROUTE_PATH}`;

/**
 * Cloudflare's name, set explicitly via `data-response-field-name` so the
 * renderer and handler agree.
 */
export const TURNSTILE_FIELD = "cf-turnstile-response";

/**
 * Lives here, not beside the router: the package entry re-exports it, and
 * the router's inferred type names packages consumers don't have.
 */
export const SUBMISSION_MODERATE_CAPABILITY = "form_submission:moderate";

/**
 * The admin page the submissions inbox is mounted at, and the export
 * name the plugin's admin chunk answers it with.
 */
export const SUBMISSIONS_PAGE_PATH = "/form-submissions";

export const SUBMISSIONS_SHELL_COMPONENT = "SubmissionsShell";

/** The block the editor places. */
export const FORM_BLOCK_NAME = "forms/form";

/** Core has no `tel`; this plugin registers it. */
export const TEL_INPUT_TYPE = "tel";

export const TEL_FIELD_COMPONENT = "TelField";

/** Any other type fails at definition, at every nesting level. */
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
  "group",
  "repeater",
] as const;

export type SupportedInputType = (typeof SUPPORTED_INPUT_TYPES)[number];

export function isSupportedInputType(
  inputType: string,
): inputType is SupportedInputType {
  return (SUPPORTED_INPUT_TYPES as readonly string[]).includes(inputType);
}

/**
 * For a repeater with no `.max()`: the body is visitor-written, so it is
 * bounded either way, and exceeding it is refused rather than truncated.
 */
export const MAX_REPEATER_ROWS = 100;

export const SOURCE_LOCALE = "en";
