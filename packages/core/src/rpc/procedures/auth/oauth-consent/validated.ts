import type {
  AuthorizationParams,
  AuthorizationRequest,
} from "../../../../auth/oauth-server/authorization-request.js";
import type { AppContext } from "../../../../context/app-context.js";
import type { BadRequestErrors } from "../../../../rpc-errors.js";
import { validateAuthorizationRequest } from "../../../../auth/oauth-server/authorization-request.js";

/**
 * The consent page re-sends the request `/authorize` already checked, so a
 * refusal here means it was altered or the client's document changed since.
 * `reason` is the OAuth error code.
 */
export async function validatedRequest(
  context: AppContext,
  params: AuthorizationParams,
  errors: BadRequestErrors,
): Promise<AuthorizationRequest> {
  const validated = await validateAuthorizationRequest(context, params);
  if (!validated.ok) {
    throw errors.BAD_REQUEST({ data: { reason: validated.refusal.error } });
  }
  return validated.request;
}
