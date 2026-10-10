import type { User } from "../db/schema/users.js";
import type { JsonObject } from "../json.js";
import type { Db } from "./app-context.js";

// Not under `auth/contract/`, where naming `Db` forms an import cycle.
/**
 * A surface that mints a credential treats `"api-token"` as anonymous. Caps
 * are `tokenScopes ∩ roleCaps`; `null` means unrestricted.
 */
export type AuthResult =
  | { readonly user: User; readonly credential: "session" }
  | {
      readonly user: User;
      readonly credential: "api-token";
      readonly tokenScopes: readonly string[] | null;
    };

/**
 * An authenticator that provisions a user stores `startingUserMeta` as its
 * meta.
 */
export interface AuthenticateScope {
  readonly startingUserMeta: JsonObject;
}

/**
 * `null` means no credential; the caller picks 401 or anonymous. Throws on a
 * malformed credential. Read-only: never mints sessions or sets cookies.
 */
export interface RequestAuthenticator {
  authenticate(
    request: Request,
    db: Db,
    scope: AuthenticateScope,
  ): Promise<AuthResult | null>;
  /**
   * Public renders skip authentication when this is false, so a custom
   * credential must report itself here. Omitted, it checks the `plumix_session`
   * cookie.
   */
  hasSession?(request: Request): boolean;
  /**
   * Needed by IdPs with their own session, or the user is silently signed back
   * in. Must return an `https://` URL or a `/` path; anything else is dropped.
   */
  signOutUrl?(request: Request): string | null;
}
