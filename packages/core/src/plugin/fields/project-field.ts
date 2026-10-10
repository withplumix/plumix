import type { CapabilityNamespaces } from "../../access/contract/capability.js";
import type { Label } from "../../i18n/label.js";
import type { MetaBoxFieldManifestEntry } from "./manifest-entry.js";
import type {
  MetaBoxField,
  MetaBoxFieldOption,
  ReferenceTarget,
  RepeaterDialogSize,
  RepeaterLayout,
  SelectAppearance,
} from "./meta-box-field.js";
import { resolveCapability } from "../../access/contract/capability.js";

/**
 * `min` / `max` widen to `number | string` because the temporal variants store
 * ISO-string bounds.
 */
interface MetaBoxFieldOptionView {
  readonly placeholder?: Label;
  readonly prepend?: Label;
  readonly append?: Label;
  readonly maxLength?: number;
  readonly min?: number | string;
  readonly max?: number | string;
  readonly step?: number;
  readonly options?: readonly MetaBoxFieldOption[];
  readonly multiple?: boolean;
  readonly appearance?: SelectAppearance;
  readonly onText?: Label;
  readonly offText?: Label;
  readonly referenceTarget?: ReferenceTarget;
  readonly marks?: readonly string[];
  readonly nodes?: readonly string[];
  readonly blocks?: readonly string[];
  readonly subFields?: readonly MetaBoxField[];
  readonly fields?: readonly MetaBoxField[];
  readonly addLabel?: Label;
  readonly layout?: RepeaterLayout;
  readonly collapsed?: string;
  readonly dialogSize?: RepeaterDialogSize;
}

/**
 * Kept off the public barrels, which re-export `manifest-entry.ts` wholesale.
 */
export function projectMetaBoxField(
  field: MetaBoxField,
  registry: CapabilityNamespaces,
): MetaBoxFieldManifestEntry {
  const view = field as MetaBoxFieldOptionView;
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    inputType: field.inputType,
    description: field.description,
    required: field.required,
    prepend: view.prepend,
    append: view.append,
    placeholder: view.placeholder,
    maxLength: view.maxLength,
    min: view.min,
    max: view.max,
    step: view.step,
    options: view.options,
    multiple: view.multiple,
    appearance: view.appearance,
    onText: view.onText,
    offText: view.offText,
    default: field.default,
    span: field.span,
    referenceTarget: view.referenceTarget,
    marks: view.marks,
    nodes: view.nodes,
    blocks: view.blocks,
    capability:
      field.capability === undefined
        ? undefined
        : resolveCapability(registry, field.capability),
    visibleWhen: field.visibleWhen,
    addLabel: view.addLabel,
    layout: view.layout,
    collapsed: view.collapsed,
    dialogSize: view.dialogSize,
    // Children keep their `span`: the row-editor dialog and group grid lay them
    // out on their own 12-column grid.
    subFields: (view.subFields ?? view.fields)?.map((sub) =>
      projectMetaBoxField(sub, registry),
    ),
  };
}
