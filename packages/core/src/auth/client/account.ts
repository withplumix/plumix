import * as v from "valibot";

import type { JsonValue } from "../../json.js";
import type {
  StoredUserMetaOf,
  UserMetaOf,
} from "../../plugin/fields/contributions.js";
import type { AuthResult } from "./result.js";
import type { SessionStore } from "./session.js";
import { failure, success } from "./result.js";

/** The signed-in user's own profile, as `useAccount()` holds it. */
export interface Account {
  readonly id: number;
  readonly name: string | null;
  readonly avatarUrl: string | null;
  readonly meta: UserMetaOf;
}

export interface AccountState {
  /** `null` when signed out, or while pending. */
  readonly account: Account | null;
  /** True until the account is known. */
  readonly isPending: boolean;
}

/** What a member may change on their own profile; `null` clears a value. */
export interface AccountPatch {
  readonly name?: string | null;
  readonly avatarUrl?: string | null;
  readonly meta?: {
    readonly [K in keyof StoredUserMetaOf]?: StoredUserMetaOf[K] | null;
  };
}

/** The `user.get` and `user.update` answer, cut to the account and its token. */
const accountEnvelopeSchema = v.object({
  json: v.object({
    id: v.number(),
    name: v.nullable(v.string()),
    avatarUrl: v.nullable(v.string()),
    meta: v.record(v.string(), v.unknown()),
    etag: v.string(),
  }),
});

export const PENDING_ACCOUNT: AccountState = { account: null, isPending: true };

const SIGNED_OUT: AccountState = { account: null, isPending: false };

/** Calls an RPC procedure with the raw envelope, resolving its answer. */
export type RpcCall = (
  procedure: string,
  input: unknown,
) => Promise<AuthResult<JsonValue>>;

export interface AccountStore {
  readonly read: () => AccountState;
  /** Loads the account on the first subscribe, or after a clear. */
  readonly subscribe: (listener: () => void) => () => void;
  readonly update: (patch: AccountPatch) => Promise<AuthResult<Account>>;
  /** Forgets the account and its token, as signing out does. */
  readonly clear: () => void;
}

/**
 * Holds the account with the `etag` its last read or save returned, which
 * never leaves this store.
 */
export function createAccountStore(
  rpc: RpcCall,
  session: SessionStore,
): AccountStore {
  let state = PENDING_ACCOUNT;
  let etag: string | null = null;
  let loaded = false;
  let loading: Promise<AuthResult<Account | null>> | null = null;
  // Bumped by `clear`, so a read that was in flight then is dropped.
  let generation = 0;
  const listeners = new Set<() => void>();

  function hold(next: AccountState, token: string | null): void {
    state = next;
    etag = token;
    for (const listener of listeners) listener();
  }

  // `null` when the answer doesn't decode.
  function holdAnswer(data: JsonValue): Account | null {
    const answer = v.safeParse(accountEnvelopeSchema, data);
    if (!answer.success) return null;
    const { etag: token, ...rest } = answer.output.json;
    // Safety: the server settles the meta bag against the registered fields
    // `UserMetaOf` folds.
    const account = { ...rest, meta: rest.meta as UserMetaOf };
    hold({ account, isPending: false }, token);
    return account;
  }

  async function fetchAccount(): Promise<AuthResult<Account | null>> {
    const started = generation;
    if (session.read().isPending) await session.refresh();
    const user = session.read().user;
    if (user === null) {
      hold(SIGNED_OUT, null);
      return success(null);
    }
    const result = await rpc("user/get", { id: user.id });
    if (generation !== started) return success(null);
    if (result.error) {
      hold(SIGNED_OUT, null);
      return result;
    }
    const account = holdAnswer(result.data);
    return account === null ? failure("unknown") : success(account);
  }

  function load(): Promise<AuthResult<Account | null>> {
    loaded = true;
    if (loading !== null) return loading;
    const run = fetchAccount().finally(() => {
      if (loading === run) loading = null;
    });
    loading = run;
    return run;
  }

  async function update(patch: AccountPatch): Promise<AuthResult<Account>> {
    if (!loaded || loading !== null) {
      const result = await load();
      if (result.error) return result;
    }
    const { account } = state;
    if (account === null || etag === null) return failure("unauthorized");
    const result = await rpc("user/update", {
      ...patch,
      id: account.id,
      ifMatch: etag,
      // The owner always wins over their own profile (ADR 0050).
      takeOver: true,
    });
    if (result.error) {
      if (result.error.code === "etag_mismatch") await load();
      return result;
    }
    const saved = holdAnswer(result.data);
    if (saved === null) return failure("unknown");
    await session.refresh();
    return success(saved);
  }

  return {
    read: () => state,
    subscribe(listener) {
      listeners.add(listener);
      if (!loaded) void load();
      return () => {
        listeners.delete(listener);
      };
    },
    update,
    clear() {
      generation += 1;
      loaded = false;
      loading = null;
      hold(SIGNED_OUT, null);
    },
  };
}
