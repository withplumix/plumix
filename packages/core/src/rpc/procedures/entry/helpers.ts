import type { MetaPatch } from "../../meta/core.js";
import { NAMED_TEMPLATE_META_KEY } from "../../../route/render/template-builders.js";

export function stripUndefined<T extends Record<string, unknown>>(
  source: T,
): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(source) as (keyof T)[]) {
    const value = source[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Fold a `named`-template choice into a meta patch under the reserved
 * `__plumix_template` key. The picker's choice can't ride the plugin meta
 * sanitizer (the key is reserved and has no registered field), so the entry
 * create/update handlers merge it here after the plugin patch is validated.
 *
 * - `undefined` — no change (caller didn't touch the template).
 * - `null` — clear the choice (delete the key → theme-default resolution).
 * - a string — set the choice.
 *
 * Returns a fresh patch (never mutates the input) or `null` when there was no
 * plugin patch and nothing to write.
 */
export function withTemplateChoice(
  patch: MetaPatch | null,
  template: string | null | undefined,
): MetaPatch | null {
  if (template === undefined) return patch;
  const upserts = new Map(patch?.upserts);
  const deletes = new Set(patch?.deletes);
  if (template === null) {
    upserts.delete(NAMED_TEMPLATE_META_KEY);
    deletes.add(NAMED_TEMPLATE_META_KEY);
  } else {
    deletes.delete(NAMED_TEMPLATE_META_KEY);
    upserts.set(NAMED_TEMPLATE_META_KEY, template);
  }
  return { upserts, deletes: [...deletes] };
}

/**
 * The plain-object counterpart of {@link withTemplateChoice}, for the autosave
 * path which merges a full meta object rather than applying a patch. Returns a
 * fresh object (never mutates the input); `undefined` leaves it untouched.
 */
export function applyTemplateChoiceToMeta(
  meta: Readonly<Record<string, unknown>>,
  template: string | null | undefined,
): Record<string, unknown> {
  if (template === undefined) return { ...meta };
  const next = { ...meta };
  if (template === null) delete next[NAMED_TEMPLATE_META_KEY];
  else next[NAMED_TEMPLATE_META_KEY] = template;
  return next;
}
