import * as v from "valibot";

import type { RpcCall } from "./account.js";
import type { AuthClientSessions } from "./registry.js";
import { failure, success } from "./result.js";

/** One of the signed-in user's sessions, as `sessions.list` resolves it. */
export interface AccountSession {
  readonly id: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  /** The session this page runs in. */
  readonly current: boolean;
}

/** The RPC encoder sends a `Date` as its ISO string. */
const dateSchema = v.pipe(
  v.string(),
  v.transform((iso) => new Date(iso)),
);

const listEnvelopeSchema = v.object({
  json: v.array(
    v.object({
      id: v.string(),
      ipAddress: v.nullable(v.string()),
      userAgent: v.nullable(v.string()),
      createdAt: dateSchema,
      expiresAt: dateSchema,
      current: v.boolean(),
    }),
  ),
});

const revokedEnvelopeSchema = v.object({ json: v.object({ id: v.string() }) });

const revokedOthersEnvelopeSchema = v.object({
  json: v.object({ revoked: v.number() }),
});

/** Plain calls with no cache: none of them ends the current session. */
export function createAccountSessions(rpc: RpcCall): AuthClientSessions {
  return {
    async list() {
      const result = await rpc("auth/sessions/list", {});
      if (result.error) return result;
      const answer = v.safeParse(listEnvelopeSchema, result.data);
      return answer.success ? success(answer.output.json) : failure("unknown");
    },
    async revoke(id) {
      const result = await rpc("auth/sessions/revoke", { id });
      if (result.error) return result;
      const answer = v.safeParse(revokedEnvelopeSchema, result.data);
      return answer.success ? success(answer.output.json) : failure("unknown");
    },
    async revokeOthers() {
      const result = await rpc("auth/sessions/revokeOthers", {});
      if (result.error) return result;
      const answer = v.safeParse(revokedOthersEnvelopeSchema, result.data);
      return answer.success ? success(answer.output.json) : failure("unknown");
    },
  };
}
