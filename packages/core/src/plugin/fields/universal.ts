import type { Capability } from "../../access/contract/capability.js";
import type { Label } from "../../i18n/label.js";
import type { JsonValue } from "../../json.js";
import type { MetaFieldCondition } from "./condition.js";
import type {
  MetaBoxFieldSpan,
  MetaBoxFieldValidate,
} from "./meta-box-field.js";

/**
 * Shared state only: methods stay per builder so each returns its concrete type
 * and keeps the phantoms. `default` is absent because its type is each field's
 * value type.
 */
export interface UniversalFieldState {
  readonly visibleWhen?: MetaFieldCondition;
  readonly label?: Label;
  readonly description?: Label;
  readonly required?: true;
  readonly span?: MetaBoxFieldSpan;
  readonly capability?: Capability;
  readonly showInApi?: true;
  readonly sanitize?: (value: unknown) => JsonValue;
  readonly validate?: MetaBoxFieldValidate;
}
