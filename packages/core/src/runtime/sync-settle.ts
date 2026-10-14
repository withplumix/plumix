import * as v from "valibot";

import type { AppContext } from "../context/app-context.js";
import { authenticateBearer, hasBearerToken } from "../auth/bearer.js";
import { settleSync } from "../context/settle-sync.js";
import {
  forbidden,
  jsonResponse,
  methodNotAllowed,
  unauthorized,
} from "./contract/http.js";

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

/**
 * Bearer only, ahead of the CSRF gate: `plumix sync` calls it from the command
 * line with an API token, whether or not the site serves its REST API.
 */
export async function handleSyncSettle(ctx: AppContext): Promise<Response> {
  if (ctx.request.method !== "POST") return methodNotAllowed(["POST"]);
  if (!hasBearerToken(ctx.request)) return unauthorized();
  const authed = await authenticateBearer(ctx);
  if (authed === null) return unauthorized();
  if (!authed.auth.can("settings:manage")) {
    return forbidden("settings_manage_required");
  }
  const event = await readEvent(ctx.request);
  if (event === null) {
    return jsonResponse({ error: "invalid_settle_event" }, { status: 400 });
  }
  return jsonResponse(await settleSync(authed, event));
}
