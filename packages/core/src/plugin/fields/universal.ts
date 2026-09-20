import type { Label } from "../../i18n/label.js";
import type { JsonValue } from "../../json.js";
import type { MetaFieldCondition } from "./condition.js";
import type {
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
} from "./meta-box-field.js";

/**
 * The state behind the chain every fluent builder carries, whatever it
 * stores — the field's label and layout, its capability gate, its
 * visibility condition, and the two server-side callbacks.
 *
 * The builders are deliberately not a class hierarchy (see
 * `capabilities.ts` for why), so the *methods* stay per-file: each has to
 * return its own concrete builder type for the phantom parameters to
 * survive the call. The state they fork into has no such constraint, and
 * this is it — declared once, so a builder cannot carry a subtly
 * different spelling of `span` or forget `showInApi` altogether.
 *
 * `default` is deliberately absent: its type is the field's own value
 * type, so it belongs to each builder's state rather than here.
 */
export interface UniversalFieldState {
  readonly visibleWhen?: MetaFieldCondition;
  readonly label?: Label;
  readonly description?: Label;
  readonly required?: true;
  readonly span?: MetaBoxFieldSpan;
  readonly capability?: string;
  readonly showInApi?: true;
  readonly sanitize?: (value: unknown) => JsonValue;
  readonly validate?: MetaBoxFieldValidate;
}
