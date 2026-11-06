import type { AuthenticatedUser } from "../context/app-context.js";
import type { ApiToken } from "../db/schema/api_tokens.js";
import type { Credential } from "../db/schema/credentials.js";
import type { User } from "../db/schema/users.js";
import { defineEvent } from "./define.js";

export interface SignIn {
  readonly user: User;
  /** A sign-in method's key, or `external` for an authenticator. */
  readonly method: string;
  readonly provider?: string;
  /**
   * True only when this sign-in enrolled the user, not when an existing user
   * adds a passkey.
   */
  readonly firstSignIn: boolean;
}

/**
 * Core's events about signing in and the credentials a user holds. `actor` is
 * who acted, which differs from `user` when an admin acts on someone else.
 */
export const auth = {
  /** Also fires on an external authenticator's first authenticated request. */
  signedIn: defineEvent<SignIn>("auth:signedIn"),
  /** Fires from `/_plumix/auth/signout`, once the session row is deleted. */
  signedOut: defineEvent<{ readonly user: User }>("auth:signedOut"),
  /** Fires when an invite is accepted, not when it is sent. */
  registered: defineEvent<{ readonly user: User }>("auth:registered"),
  /** The email is not changed yet; `emailChanged` fires once it is. */
  emailChangeRequested: defineEvent<{
    readonly user: User;
    readonly actor: AuthenticatedUser;
    readonly newEmail: string;
    readonly expiresAt: Date;
  }>("auth:emailChangeRequested"),
  /** The user's sessions are already invalidated, the actor's included. */
  emailChanged: defineEvent<{
    readonly user: User;
    readonly previousEmail: string;
  }>("auth:emailChanged"),
  /**
   * Also fires on first signup and invite acceptance. The payload omits the
   * public key; read the full row from `ctx.db`.
   */
  credentialCreated: defineEvent<{
    readonly credential: Pick<
      Credential,
      "id" | "userId" | "name" | "deviceType" | "isBackedUp"
    >;
    readonly actor: AuthenticatedUser;
  }>("auth:credentialCreated"),
  /** Self-only: `actor.id === credential.userId` always. */
  credentialRevoked: defineEvent<{
    readonly credential: { readonly id: string; readonly userId: number };
    readonly actor: AuthenticatedUser;
  }>("auth:credentialRevoked"),
  /** Self-only, like `credentialRevoked`. */
  credentialRenamed: defineEvent<{
    readonly credential: { readonly id: string; readonly userId: number };
    readonly actor: AuthenticatedUser;
    readonly name: string;
  }>("auth:credentialRenamed"),
  /** The user's links to `provider` were removed. Self-only. */
  oauthAccountUnlinked: defineEvent<{
    readonly oauthAccount: {
      readonly provider: string;
      readonly userId: number;
    };
    readonly actor: AuthenticatedUser;
  }>("auth:oauthAccountUnlinked"),
  /**
   * Only the actor's own sessions can be revoked. `mode` tells a single revoke
   * from "everywhere except this browser".
   */
  sessionRevoked: defineEvent<{
    readonly session: { readonly id: string; readonly userId: number };
    readonly actor: AuthenticatedUser;
    readonly mode: "single" | "all_others";
  }>("auth:sessionRevoked"),
  /** The token row without its secret. Minting is self-only. */
  apiTokenCreated: defineEvent<{
    readonly apiToken: Pick<
      ApiToken,
      "id" | "userId" | "name" | "prefix" | "scopes" | "expiresAt"
    >;
    readonly actor: AuthenticatedUser;
  }>("auth:apiTokenCreated"),
  /** `mode` is `self` for the owner's revoke, `admin` for an admin's. */
  apiTokenRevoked: defineEvent<{
    readonly apiToken: { readonly id: string; readonly userId: number };
    readonly actor: AuthenticatedUser;
    readonly mode: "self" | "admin";
  }>("auth:apiTokenRevoked"),
  /**
   * Fires at approval, before the polling client mints the token, so the
   * decision is recorded apart from the mint.
   */
  deviceCodeApproved: defineEvent<{
    readonly deviceCode: {
      readonly id: string;
      readonly userCode: string;
      readonly tokenName: string;
      readonly scopes: readonly string[] | null;
    };
    readonly actor: AuthenticatedUser;
  }>("auth:deviceCodeApproved"),
  /** The polling client gets `access_denied` on its next exchange. */
  deviceCodeDenied: defineEvent<{
    readonly deviceCode: { readonly id: string; readonly userCode: string };
    readonly actor: AuthenticatedUser;
  }>("auth:deviceCodeDenied"),
};
