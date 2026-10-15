import type { MessageDescriptor } from "@lingui/core";

import type { Label } from "../i18n/label.js";
import type { JsonObject } from "../json.js";
import type { MetaBoxField, PluginRegistry } from "../plugin/manifest.js";
import { labelSourceText } from "../i18n/label.js";
import {
  MetaValidationError,
  validateAndPromoteMetaBag,
} from "../meta/core.js";
import { listEntryMetaFields, listTermMetaFields } from "../plugin/manifest.js";

/** Whose fields an imported meta bag is checked against. */
export type ImportedMetaOwner =
  { readonly entryType: string } | { readonly taxonomy: string };

export type ImportedMeta =
  | { readonly meta: JsonObject; readonly errors?: undefined }
  | { readonly meta?: undefined; readonly errors: readonly string[] };

function fieldsOf(
  registry: PluginRegistry,
  owner: ImportedMetaOwner,
): readonly MetaBoxField[] {
  return "entryType" in owner
    ? listEntryMetaFields(registry, owner.entryType)
    : listTermMetaFields(registry, owner.taxonomy);
}

/** A message with its `{name}` placeholders filled from its values. */
function messageText(label: Label): string {
  const text = labelSourceText(label);
  const values = (label as MessageDescriptor).values ?? {};
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

/**
 * Judged as a publish judges a bag, plus a key no field owns is an error here:
 * an import has no stored row whose extra keys it must keep.
 */
export async function checkImportedMeta(
  registry: PluginRegistry,
  owner: ImportedMetaOwner,
  meta: JsonObject,
): Promise<ImportedMeta> {
  const fields = fieldsOf(registry, owner);
  const known = new Set(fields.map((field) => field.key));
  const unknown = Object.keys(meta).filter((key) => !known.has(key));
  if (unknown.length > 0) {
    return { errors: unknown.map((key) => `unknown field "${key}"`) };
  }
  try {
    return {
      meta: await validateAndPromoteMetaBag(
        fields,
        meta,
        new Set(Object.keys(meta)),
      ),
    };
  } catch (error) {
    if (!(error instanceof MetaValidationError)) throw error;
    return {
      errors: error.errors.map(
        (fieldError) =>
          `field "${fieldError.path}": ${messageText(fieldError.message)}`,
      ),
    };
  }
}
