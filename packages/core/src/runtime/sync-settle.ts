import * as v from "valibot";

import type { AppContext } from "../context/app-context.js";
import { settleSync } from "../context/settle-sync.js";
import { jsonResponse, methodNotAllowed } from "./contract/http.js";
import { authorizeSyncOperator } from "./sync-operator.js";

const SyncAfterEventSchema = v.object({
  scopes: v.array(v.string()),
  direction: v.picklist(["pull", "push"]),
});

async function readEvent(
  request: Request,
): Promise<v.InferOutput<typeof SyncAfterEventSchema> | null> {
  try {
    const parsed = v.safeParse(SyncAfterEventSchema, await request.json());
    return parsed.success ? parsed.output : null;
  } catch {
    return null;
  }
}

/** Runs core's `settleSync` for the operator `plumix sync` calls it as. */
export async function handleSyncSettle(ctx: AppContext): Promise<Response> {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
  const authed = await authorizeSyncOperator(ctx);
  if (authed instanceof Response) return authed;
  const event = await readEvent(ctx.request);
  if (event === null) {
    return jsonResponse({ error: "invalid_settle_event" }, { status: 400 });
  }
  return jsonResponse(await settleSync(authed, event));
}
