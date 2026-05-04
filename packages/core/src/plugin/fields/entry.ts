import type {
  EntryReferenceMetaBoxField,
  MetaBoxFieldSpan,
} from "../manifest.js";

/**
 * Public scope shape for the `entry()` reference field. Carried on
 * the field's `referenceTarget.scope`; the entry `LookupAdapter`
 * consumes it for write-time validation, picker filtering, and
 * read-time orphan resolution.
 */
export interface EntryFieldScope {
  /**
   * Restrict matches to these entry types. Required at the field
   * level — entry references without a type filter would surface
   * the entire content table to pickers.
   */
  readonly entryTypes: readonly string[];
  /**
   * Whether to surface trashed entries. Default `false` — trashed
   * entries are usually invalid reference targets.
   */
  readonly includeTrashed?: boolean;
}

export interface EntryFieldOptions {
  readonly key: string;
  readonly label: string;
  readonly required?: boolean;
  readonly description?: string;
  readonly default?: string;
  readonly span?: MetaBoxFieldSpan;
  readonly entryTypes: readonly string[];
  readonly includeTrashed?: boolean;
}

/**
 * Build a typed `entry` reference field. Storage is the bare entry
 * id; reads return the resolved label/subtitle (or `null` for
 * orphans). The admin renders a picker that calls the lookup RPC
 * with `{ kind: "entry", scope: { entryTypes, includeTrashed } }`.
 */
export function entry(options: EntryFieldOptions): EntryReferenceMetaBoxField {
  const scope: EntryFieldScope = {
    entryTypes: options.entryTypes,
    includeTrashed: options.includeTrashed,
  };
  return {
    key: options.key,
    label: options.label,
    type: "string",
    inputType: "entry",
    referenceTarget: { kind: "entry", scope },
    required: options.required,
    description: options.description,
    default: options.default,
    span: options.span,
  };
}
