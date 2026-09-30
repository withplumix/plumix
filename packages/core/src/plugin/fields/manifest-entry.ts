// Wire projection for a single meta-box field — the `MetaBoxFieldManifestEntry`
// shape the admin renders from, and the `MetaBoxField` -> entry projectors that
// produce it. Split out of `../build-manifest.ts` so a plugin that renders its
// own fields can reach the projection without pulling the whole build-time
// manifest projection (and its block / registry graph) behind it. Re-exported
// from the public `@plumix/core/manifest` and `@plumix/core/fields` barrels.

import type { CapabilityNamespaces } from "../../access/contract/capability.js";
import type { Label } from "../../i18n/label.js";
import type { MetaFieldCondition } from "./condition.js";
import type {
  MetaBoxField,
  MetaBoxFieldOption,
  MetaBoxFieldSpan,
  MetaScalarType,
  ReferenceTarget,
  RepeaterDialogSize,
  RepeaterLayout,
  SelectAppearance,
} from "./meta-box-field.js";
import { projectMetaBoxField } from "./project-field.js";

/**
 * Client-safe field descriptor inside a meta box. Mirrors `MetaBoxField`
 * minus the server-only `sanitize` and `validate` callbacks, which run on
 * the server and have no serialisable stand-in.
 */
export interface MetaBoxFieldManifestEntry {
  readonly key: string;
  readonly label: Label;
  readonly type: MetaScalarType;
  readonly inputType: string;
  readonly description?: Label;
  readonly required?: boolean;
  /** Static input adornments — see `StringMetaBoxField.prepend` / `.append`. */
  readonly prepend?: Label;
  readonly append?: Label;
  readonly placeholder?: Label;
  readonly maxLength?: number;
  /**
   * Lower bound. `number` carries it as a number; `date` / `datetime`
   * / `time` carry it as the matching ISO string. Renderers branch on
   * `inputType` to pick the right interpretation.
   */
  readonly min?: number | string;
  /** Upper bound — see `min`. */
  readonly max?: number | string;
  readonly step?: number;
  readonly options?: readonly MetaBoxFieldOption[];
  /** Choice-field cardinality — `select` fields store an array when set. */
  readonly multiple?: boolean;
  /** Choice-field control variant — see `SelectAppearance`. */
  readonly appearance?: SelectAppearance;
  /** Toggle switch state labels — see `ToggleMetaBoxField`. */
  readonly onText?: Label;
  readonly offText?: Label;
  readonly default?: unknown;
  readonly span?: MetaBoxFieldSpan;
  /**
   * Carried for reference field variants (`user`, `entry`, `term`,
   * `media`, plugin-registered kinds). The admin's generic picker
   * dispatches on `referenceTarget.kind` to call the matching
   * lookup RPC; `scope` rides along untouched.
   */
  readonly referenceTarget?: ReferenceTarget;
  /**
   * Richtext field allowlists — wire projection of
   * `RichtextMetaBoxField`'s `marks` / `nodes` / `blocks`. See that
   * type for semantics.
   */
  readonly marks?: readonly string[];
  readonly nodes?: readonly string[];
  readonly blocks?: readonly string[];
  /**
   * Child-field manifest for the composite field types — repeater row
   * schema and group members alike, keyed positionally, same shape as a
   * top-level field. Children keep their `span`: the row-editor dialog and
   * group grid lay them out on a 12-column grid that honours it. Sanitize
   * callbacks are stripped from the wire shape; the admin recurses through
   * this list when rendering each row / group. The renderer dispatches on
   * `inputType` (`repeater` vs `group`) to interpret it.
   */
  readonly subFields?: readonly MetaBoxFieldManifestEntry[];
  /** Repeater add-row button label — see {@link RepeaterMetaBoxField.addLabel}. */
  readonly addLabel?: Label;
  /** Repeater row layout — see {@link RepeaterLayout}. */
  readonly layout?: RepeaterLayout;
  /** Repeater collapsed-row summary sub-field key — see {@link RepeaterMetaBoxField.collapsed}. */
  readonly collapsed?: string;
  /** Repeater row-editor dialog width — see {@link RepeaterDialogSize}. */
  readonly dialogSize?: RepeaterDialogSize;
  /**
   * Capability gate for the individual field. See `MetaBoxFieldBase.capability`.
   */
  readonly capability?: string;
  /**
   * Conditional visibility rules. See `MetaBoxFieldBase.visibleWhen`.
   */
  readonly visibleWhen?: MetaFieldCondition;
}

// A caller projecting fields without a registry resolves an entry reference
// under the type's own name, as for a type nobody registered.
const NO_ENTRY_TYPES: CapabilityNamespaces = { entryTypes: new Map() };

/**
 * Project one compiled field definition into the wire entry a renderer reads.
 * Repeater rows and group members recurse into `subFields`; the server-only
 * `sanitize` / `validate` callbacks drop out. A capability reference resolves
 * as it would for a type nobody registered.
 *
 * The transform only — the key, duplicate and condition-driver checks
 * `register*MetaBox` runs live in `../validation/meta-box-fields.ts`, and a
 * caller projecting fields itself owns them.
 */
export function toMetaBoxFieldEntry(
  field: MetaBoxField,
): MetaBoxFieldManifestEntry {
  return projectMetaBoxField(field, NO_ENTRY_TYPES);
}
