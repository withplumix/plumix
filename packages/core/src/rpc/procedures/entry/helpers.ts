import type { SelectableAccessPolicy } from "../../../plugin/manifest.js";
import type { MetaPatch } from "../../meta/core.js";
import { ACCESS_POLICY_META_KEY } from "../../../access/meta-key.js";
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

/**
 * Fold a per-entry access-policy choice into a meta patch under the reserved
 * `__plumix_access` key. Like the template choice, the key is reserved with no
 * registered field, so the create/update handlers merge it after the plugin
 * meta patch is validated (and after {@link assertAccessChoiceDeclared} has
 * confirmed the key is one the type declares).
 *
 * - `undefined` — no change.
 * - `null` — clear the choice (delete the key → type-default gating).
 * - a string — set the choice to that policy key.
 *
 * Returns a fresh patch (never mutates the input) or `null` when there was no
 * plugin patch and nothing to write.
 */
export function withAccessChoice(
  patch: MetaPatch | null,
  access: string | null | undefined,
): MetaPatch | null {
  if (access === undefined) return patch;
  const upserts = new Map(patch?.upserts);
  const deletes = new Set(patch?.deletes);
  if (access === null) {
    upserts.delete(ACCESS_POLICY_META_KEY);
    deletes.add(ACCESS_POLICY_META_KEY);
  } else {
    deletes.delete(ACCESS_POLICY_META_KEY);
    upserts.set(ACCESS_POLICY_META_KEY, access);
  }
  return { upserts, deletes: [...deletes] };
}

/**
 * The plain-object counterpart of {@link withAccessChoice}, for the autosave
 * path which merges a full meta object rather than a patch. Returns a fresh
 * object (never mutates the input); `undefined` leaves it untouched.
 */
export function applyAccessChoiceToMeta(
  meta: Readonly<Record<string, unknown>>,
  access: string | null | undefined,
): Record<string, unknown> {
  if (access === undefined) return { ...meta };
  const next = { ...meta };
  if (access === null) delete next[ACCESS_POLICY_META_KEY];
  else next[ACCESS_POLICY_META_KEY] = access;
  return next;
}

interface AccessChoiceErrors {
  BAD_REQUEST: (args: { data: { reason: string } }) => Error;
}

/**
 * Reject a per-entry access `key` the entry type doesn't declare — the
 * enforcement behind "an editor cannot select a policy the developer didn't
 * declare". `undefined` (no change) and `null` (clear to type default) always
 * pass; any other value must match a declared {@link SelectableAccessPolicy}.
 * Takes the procedure's `errors` and throws directly, mirroring
 * `assertContentWithinByteCap`.
 */
export function assertAccessChoiceDeclared(
  policies: readonly SelectableAccessPolicy[] | undefined,
  access: string | null | undefined,
  errors: Pick<AccessChoiceErrors, "BAD_REQUEST">,
): void {
  if (access === undefined || access === null) return;
  if (!policies?.some((policy) => policy.key === access)) {
    throw errors.BAD_REQUEST({ data: { reason: "access_policy_undeclared" } });
  }
}
