import type { AccessOutcome } from "../access/contract/policy.js";
import type { AppContext } from "../context/app-context.js";
import type { SQL } from "../db/index.js";
import type { JsonObject } from "../json.js";
import type { ResolvedMeta } from "../meta/contract/bags.js";
import { ACCESS_POLICY_META_KEY } from "../access/contract/meta-key.js";
import { inArray, isNull, notInArray, or, sql } from "../db/index.js";
import { entries } from "../db/schema/entries.js";

/**
 * What a policy's gate lets its principal have of an entry. A soft challenge
 * lists the entry as a teaser; only `allow` hands over its body.
 */
export type EntryAdmission = "content" | "listing";

type Admits = EntryAdmission | "nothing";

interface TypeAdmission {
  readonly default: Admits;
  readonly byKey: ReadonlyMap<string, Admits>;
}

/** The parts of an entry its access policy is chosen by. */
export interface EntryAccessSubject {
  readonly type: string;
  /**
   * Either form works: the access key is a plain string that survives decoding.
   */
  readonly meta?: JsonObject | ResolvedMeta | null;
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
  return meets(admits, level);
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
    meets(admission.byKey.get(key) ?? "nothing", level),
  );
  const defaultAdmitted = meets(admission.default, level);
  if (defaultAdmitted && admitted.length === keys.length) return undefined;
  const stored = sql`json_extract(${entries.meta}, ${STORED_KEY_PATH})`;
  const arms: SQL[] = [];
  if (admitted.length > 0) arms.push(inArray(stored, admitted));
  // A missing, stale or non-string key falls to `default`, as on the gate.
  if (defaultAdmitted) {
    arms.push(sql`(${or(isNull(stored), notInArray(stored, keys))})`);
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
    const policies = access.policies ?? [];
    const [fallback, ...chosen] = await Promise.all(
      [access.default, ...policies.map((p) => p.policy)].map(async (policy) =>
        admitsOf(await policy.resolve(ctx)),
      ),
    );
    const byKey = new Map<string, Admits>();
    policies.forEach((p, index) => {
      // The first policy with a key wins, as `selectEntryPolicy` picks it.
      if (!byKey.has(p.key)) byKey.set(p.key, chosen[index] ?? "nothing");
    });
    return { default: fallback ?? "nothing", byKey };
  });
}

function admitsOf(outcome: AccessOutcome): Admits {
  if (outcome.type === "grant") return "content";
  if (outcome.type === "challenge" && outcome.soft === true) return "listing";
  return "nothing";
}

function meets(admits: Admits, level: EntryAdmission): boolean {
  if (admits === "nothing") return false;
  return level === "listing" || admits === "content";
}

/**
 * The per-entry access choice stored under the reserved meta key, or
 * `undefined` when unset (or stored as a non-string by some out-of-band write).
 */
export function readAccessKey(
  meta: EntryAccessSubject["meta"],
): string | undefined {
  const value = meta?.[ACCESS_POLICY_META_KEY];
  return typeof value === "string" ? value : undefined;
}
