import type { SelectableAccessPolicy } from "../plugin/manifest.js";
import type { BadRequestErrors } from "../rpc-errors.js";
import type { MetaPatch } from "./core.js";
import { ACCESS_POLICY_META_KEY } from "../access/contract/meta-key.js";
import { NAMED_TEMPLATE_META_KEY } from "../route/contract/named-template.js";

/**
 * `undefined` leaves the choice, `null` clears it to the theme default.
 * Returns a fresh patch, or `null` when there was nothing to write.
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
 * `undefined` leaves the choice, `null` clears it to the type default.
 * Returns a fresh patch, or `null` when there was nothing to write.
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
 * Throws `BAD_REQUEST` for a key the type doesn't declare; `undefined` and
 * `null` always pass.
 */
export function assertAccessChoiceDeclared(
  policies: readonly SelectableAccessPolicy[] | undefined,
  access: string | null | undefined,
  errors: BadRequestErrors,
): void {
  if (access === undefined || access === null) return;
  if (!policies?.some((policy) => policy.key === access)) {
    throw errors.BAD_REQUEST({ data: { reason: "access_policy_undeclared" } });
  }
}
