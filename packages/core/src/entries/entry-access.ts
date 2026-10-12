import type { EntryAccessSubject } from "../access/contract/access-key.js";
import type { AccessPolicyFor } from "../access/contract/policy.js";
import type { EntryAdmission } from "../access/policy.js";
import type { AppContext } from "../context/app-context.js";
import type { SQL } from "../db/index.js";
import { readAccessKey } from "../access/contract/access-key.js";
import { ACCESS_POLICY_META_KEY } from "../access/contract/meta-key.js";
import { admissionMeets, admissionOf } from "../access/policy.js";
import { inArray, isNull, notInArray, or, sql } from "../db/index.js";
import { entries } from "../db/schema/entries.js";

type Admits = EntryAdmission | "nothing";

interface TypeAdmission {
  readonly default: Admits;
  readonly byKey: ReadonlyMap<string, Admits>;
}

/**
 * Whether the entry's policy admits `ctx`'s principal at `level`. Weighs only
 * the policy: not the entry's status, and not a capability.
 */
export async function entryPolicyAdmits(
  ctx: AppContext,
  entry: EntryAccessSubject,
  level: EntryAdmission,
): Promise<boolean> {
  const admission = await typeAdmission(ctx, entry.type);
  if (admission === undefined) return true;
  const key = readAccessKey(entry.meta);
  const admits =
    key === undefined
      ? admission.default
      : (admission.byKey.get(key) ?? admission.default);
  return admissionMeets(admits, level);
}

/**
 * The SQL form of {@link entryPolicyAdmits} for rows of `type`, matched by stored
 * key. `undefined` when every row is admitted, the type having no policy.
 */
export async function policyAdmittedRows(
  ctx: AppContext,
  type: string,
  level: EntryAdmission,
): Promise<SQL | undefined> {
  const admission = await typeAdmission(ctx, type);
  if (admission === undefined) return undefined;
  const keys = [...admission.byKey.keys()];
  const admitted = keys.filter((key) =>
    admissionMeets(admission.byKey.get(key) ?? "nothing", level),
  );
  const defaultAdmitted = admissionMeets(admission.default, level);
  if (defaultAdmitted && admitted.length === keys.length) return undefined;
  const stored = sql`json_extract(${entries.meta}, ${STORED_KEY_PATH})`;
  const arms: SQL[] = [];
  if (admitted.length > 0) arms.push(inArray(stored, admitted));
  if (defaultAdmitted) {
    const fallsToDefault = or(isNull(stored), notInArray(stored, keys));
    arms.push(sql`(${fallsToDefault})`);
  }
  return arms.length === 0 ? sql`0` : sql`(${or(...arms)})`;
}

/** The spelling `metaJsonPath` gives a key, so writes and this read agree. */
const STORED_KEY_PATH = `$."${ACCESS_POLICY_META_KEY}"`;

/**
 * Once per request and principal, whatever the list's length. Building the key
 * reads the principal, so a render listing a policied type is personal.
 */
function typeAdmission(
  ctx: AppContext,
  type: string,
): Promise<TypeAdmission | undefined> {
  const access = ctx.plugins.entryTypes.get(type)?.access;
  if (access === undefined) return Promise.resolve(undefined);
  const principal = ctx.user === null ? "anonymous" : `user:${ctx.user.id}`;
  return ctx.memo(`core:entry-access:${type}:${principal}`, async () => {
    const admits = async (
      policy: AccessPolicyFor<AppContext>,
    ): Promise<Admits> => admissionOf(await policy.resolve(ctx));
    const [fallback, chosen] = await Promise.all([
      admits(access.default),
      Promise.all(
        (access.policies ?? []).map(
          async ({ key, policy }) => [key, await admits(policy)] as const,
        ),
      ),
    ]);
    const byKey = new Map<string, Admits>();
    for (const [key, admits] of chosen) {
      if (!byKey.has(key)) byKey.set(key, admits);
    }
    return { default: fallback, byKey };
  });
}
