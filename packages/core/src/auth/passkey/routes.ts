import * as v from "valibot";

import type { AppContext } from "../../context/app.js";
import type { User } from "../../db/schema/users.js";
import type { PlumixApp } from "../../runtime/app.js";
import type { ValidInvite } from "../invite.js";
import type { AuthenticationResponse } from "./types.js";
import { eq, isUniqueConstraintError } from "../../db/index.js";
import { credentials } from "../../db/schema/credentials.js";
import { users } from "../../db/schema/users.js";
import { jsonResponse } from "../../runtime/http.js";
import { provisionUser } from "../bootstrap.js";
import {
  buildSessionDeletionCookie,
  isSecureRequest,
  readSessionCookie,
} from "../cookies.js";
import {
  consumeInviteToken,
  InviteError,
  validateInviteToken,
} from "../invite.js";
import { invalidateSession, validateSession } from "../sessions.js";
import { mintSessionAndCookie } from "../sign-in.js";
import { beginAuthentication, finishAuthentication } from "./authenticate.js";
import { PasskeyError } from "./errors.js";
import {
  beginRegistration,
  finishRegistration,
  persistCredential,
} from "./register.js";

const emailSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.email(),
  v.maxLength(255),
);

const registerOptionsInputSchema = v.object({
  email: emailSchema,
  name: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
});

const loginOptionsInputSchema = v.object({
  email: v.optional(emailSchema),
});

// Opaque invite token (generateToken's base64url output, ~32 chars).
// We cap generously to protect the hashToken path from pathological inputs.
const inviteTokenSchema = v.pipe(v.string(), v.minLength(16), v.maxLength(256));

// Defensive upper bound for credential IDs from untrusted WebAuthn responses.
// Real credential IDs are typically tens to a few hundred bytes; 1 KiB
// preserves compatibility while blocking pathological payloads from reaching
// deeper parsing paths.
const MAX_CREDENTIAL_ID_LENGTH = 1024;
// Defensive cap for large binary WebAuthn fields that arrive base64url-encoded
// in JSON — clientDataJSON, attestationObject, authenticatorData, signature.
// 64 KiB is intentionally generous for interoperability while bounding memory
// and CPU on oversized inputs so they can't reach the oslo parsers at all.
const MAX_WEBAUTHN_FIELD_LENGTH = 65_536;

const base64urlField = (max: number) =>
  v.pipe(v.string(), v.minLength(1), v.maxLength(max));

const credentialTransportSchema = v.picklist([
  "usb",
  "nfc",
  "ble",
  "internal",
  "hybrid",
] as const);

const registerResponseSchema = v.object({
  id: base64urlField(MAX_CREDENTIAL_ID_LENGTH),
  rawId: base64urlField(MAX_CREDENTIAL_ID_LENGTH),
  type: v.literal("public-key"),
  response: v.object({
    clientDataJSON: base64urlField(MAX_WEBAUTHN_FIELD_LENGTH),
    attestationObject: base64urlField(MAX_WEBAUTHN_FIELD_LENGTH),
    transports: v.optional(v.array(credentialTransportSchema)),
  }),
});

const authenticationResponseSchema = v.object({
  id: base64urlField(MAX_CREDENTIAL_ID_LENGTH),
  rawId: base64urlField(MAX_CREDENTIAL_ID_LENGTH),
  type: v.literal("public-key"),
  response: v.object({
    clientDataJSON: base64urlField(MAX_WEBAUTHN_FIELD_LENGTH),
    authenticatorData: base64urlField(MAX_WEBAUTHN_FIELD_LENGTH),
    signature: base64urlField(MAX_WEBAUTHN_FIELD_LENGTH),
    userHandle: v.optional(
      v.nullable(base64urlField(MAX_WEBAUTHN_FIELD_LENGTH)),
    ),
  }),
});

async function parseJson<
  TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(request: Request, schema: TSchema): Promise<v.InferOutput<TSchema> | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  const parsed = v.safeParse(schema, body);
  return parsed.success ? parsed.output : null;
}

function invalidInput(): Response {
  return jsonResponse({ error: "invalid_input" }, { status: 400 });
}

function passkeyError(ctx: AppContext, error: PasskeyError): Response {
  if (error.code === "invalid_origin") {
    ctx.logger.warn("passkey: invalid_origin", { ...error.detail });
  }
  return jsonResponse(
    { error: error.code, message: error.message },
    { status: 400 },
  );
}

async function findOrProvisionUser(
  ctx: AppContext,
  email: string,
  name: string | null,
): Promise<User> {
  const existing = await ctx.db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) return existing;

  try {
    const { user } = await provisionUser(ctx.db, {
      email,
      name,
      emailVerified: true,
    });
    return user;
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const raced = await ctx.db.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (!raced) throw error;
    return raced;
  }
}

export async function handlePasskeyRegisterOptions(
  ctx: AppContext,
  app: PlumixApp,
): Promise<Response> {
  const input = await parseJson(ctx.request, registerOptionsInputSchema);
  if (!input) return invalidInput();

  const authed = await resolveAuthedUser(ctx);
  const policy = await decideRegistrationPolicy(ctx, authed, input.email);
  if (policy.outcome === "denied") {
    return jsonResponse({ error: policy.reason }, { status: 403 });
  }

  const user =
    policy.outcome === "bootstrap"
      ? await findOrProvisionUser(ctx, input.email, input.name ?? null)
      : policy.user;

  const excludeCredentials =
    policy.outcome === "add-device"
      ? await ctx.db
          .select()
          .from(credentials)
          .where(eq(credentials.userId, user.id))
      : undefined;

  const options = await beginRegistration(ctx.db, app.passkey, {
    userId: user.id,
    userEmail: user.email,
    userDisplayName: user.name ?? user.email,
    excludeCredentials,
  });

  return jsonResponse(options);
}

type RegistrationPolicy =
  | { outcome: "bootstrap" }
  | { outcome: "add-device"; user: User }
  | { outcome: "denied"; reason: "registration_closed" | "email_mismatch" };

async function decideRegistrationPolicy(
  ctx: AppContext,
  authed: User | null,
  email: string,
): Promise<RegistrationPolicy> {
  if (authed) {
    if (authed.email !== email) {
      return { outcome: "denied", reason: "email_mismatch" };
    }
    return { outcome: "add-device", user: authed };
  }
  const userCount = await ctx.db.$count(users);
  if (userCount === 0) return { outcome: "bootstrap" };
  return { outcome: "denied", reason: "registration_closed" };
}

async function resolveAuthedUser(ctx: AppContext): Promise<User | null> {
  const token = readSessionCookie(ctx.request);
  if (!token) return null;
  const validated = await validateSession(ctx.db, token, undefined);
  return validated?.user ?? null;
}

export async function handlePasskeyRegisterVerify(
  ctx: AppContext,
  app: PlumixApp,
): Promise<Response> {
  const payload = await parseJson(ctx.request, registerResponseSchema);
  if (!payload) return invalidInput();

  try {
    const verified = await finishRegistration(ctx.db, app.passkey, payload);
    if (verified.userId === null) {
      return jsonResponse(
        { error: "challenge_not_bound_to_user" },
        { status: 400 },
      );
    }

    const credential = await persistCredential(ctx.db, {
      userId: verified.userId,
      verified,
      maxPerUser: app.passkey.maxCredentialsPerUser,
    });

    // Look up the full user row for the hook payload (createSession
    // doesn't return one). Cheap PK lookup on a path that's already
    // doing several writes.
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, verified.userId),
    });

    const { cookieHeader } = await mintSessionAndCookie(
      ctx,
      app,
      verified.userId,
    );

    if (user) {
      const userCount = await ctx.db.$count(
        credentials,
        eq(credentials.userId, user.id),
      );
      // First credential ever → this is the bootstrap path; subsequent
      // verifies are "add another device". Audit-log subscribers branch
      // on `firstSignIn` to render onboarding-specific copy.
      const firstSignIn = userCount === 1;
      await ctx.hooks.doAction(
        "credential:created",
        {
          id: credential.id,
          userId: credential.userId,
          name: credential.name,
          deviceType: credential.deviceType,
          isBackedUp: credential.isBackedUp,
        },
        { actor: { id: user.id, email: user.email, role: user.role } },
      );
      await ctx.hooks.doAction("user:signed_in", user, {
        method: "passkey",
        firstSignIn,
      });
    }

    return jsonResponse(
      { userId: verified.userId },
      {
        status: 200,
        headers: { "set-cookie": cookieHeader },
      },
    );
  } catch (error) {
    if (error instanceof PasskeyError) return passkeyError(ctx, error);
    throw error;
  }
}

export async function handlePasskeyLoginOptions(
  ctx: AppContext,
  app: PlumixApp,
): Promise<Response> {
  const input = await parseJson(ctx.request, loginOptionsInputSchema);
  if (!input) return invalidInput();

  const user = input.email
    ? await ctx.db.query.users.findFirst({
        where: eq(users.email, input.email),
      })
    : null;
  const allowCredentials = user
    ? await ctx.db
        .select()
        .from(credentials)
        .where(eq(credentials.userId, user.id))
    : [];

  const options = await beginAuthentication(ctx.db, app.passkey, {
    allowCredentials,
  });
  return jsonResponse(options);
}

export async function handlePasskeyLoginVerify(
  ctx: AppContext,
  app: PlumixApp,
): Promise<Response> {
  const payload = await parseJson(ctx.request, authenticationResponseSchema);
  if (!payload) return invalidInput();

  try {
    const verified = await finishAuthentication(
      ctx.db,
      app.passkey,
      payload as AuthenticationResponse,
    );
    await ctx.db
      .update(credentials)
      .set({ counter: verified.newSignatureCounter })
      .where(eq(credentials.id, verified.credential.id));

    const { cookieHeader } = await mintSessionAndCookie(
      ctx,
      app,
      verified.credential.userId,
    );

    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, verified.credential.userId),
    });
    if (user) {
      await ctx.hooks.doAction("user:signed_in", user, {
        method: "passkey",
        firstSignIn: false,
      });
    }

    return jsonResponse(
      { userId: verified.credential.userId },
      {
        status: 200,
        headers: { "set-cookie": cookieHeader },
      },
    );
  } catch (error) {
    if (error instanceof PasskeyError) return passkeyError(ctx, error);
    throw error;
  }
}

export async function handleSignout(ctx: AppContext): Promise<Response> {
  const token = readSessionCookie(ctx.request);
  if (token) {
    // Resolve the user before invalidating so the hook payload carries
    // the row that was just signed out (for audit attribution).
    const validated = await validateSession(ctx.db, token, undefined);
    await invalidateSession(ctx.db, token);
    if (validated) {
      await ctx.hooks.doAction("user:signed_out", validated.user);
    }
  }
  const cookie = buildSessionDeletionCookie({
    secure: isSecureRequest(ctx.request),
    sameSite: "Lax",
  });
  // If the configured authenticator runs an external session (CF
  // Access, SAML), surface the IdP logout URL so the admin client can
  // navigate there after clearing the local cookie. Without this, the
  // next request would carry the same IdP credential and silently
  // re-auth the user.
  const redirectTo = sanitiseSignOutUrl(ctx.authenticator.signOutUrl?.());
  return jsonResponse(
    { ok: true, redirectTo },
    { status: 200, headers: { "set-cookie": cookie } },
  );
}

// Defense-in-depth: the authenticator interface is operator-trusted
// (set at config time, never request-injected), but we still validate
// the URL shape before shipping it to the admin client. A buggy or
// malicious authenticator returning `javascript:`, a protocol-relative
// URL, or a string with embedded CR/LF would otherwise become a
// trusted navigation target.
function sanitiseSignOutUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (/[\r\n]/.test(value)) return null;
  const sameOriginPath = value.startsWith("/") && !value.startsWith("//");
  const httpsAbsolute = value.startsWith("https://");
  return sameOriginPath || httpsAbsolute ? value : null;
}

// Invite acceptance — two routes paired with the passkey register flow.
// An invite token (from user.invite in Phase 9) unlocks registration for
// a user row that otherwise can't sign up because decideRegistrationPolicy
// returns "registration_closed" for post-bootstrap unauthenticated callers.
//
// Security model:
//   - Token is hashed in DB (Phase 9 writes SHA-256; see auth/tokens.ts).
//   - Single-use: consumed after the credential is persisted.
//   - TTL checked at both options and verify time — a token could expire
//     between the two calls on a slow client.
//   - Target user must still exist and not be disabled — admins can cancel
//     an invite by disabling or deleting the row.
//   - Refuse if the user already has any credentials — the invite isn't
//     for a re-registration; an active user should use /passkey/register
//     (add-device) while authenticated.
//   - Challenge binding defends against a cross-user replay: the WebAuthn
//     challenge issued by beginRegistration is keyed to the invited user's
//     id, so a response captured for a different user can't complete here.

const inviteRegisterOptionsInputSchema = v.object({
  token: inviteTokenSchema,
  name: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
});

const inviteRegisterVerifyInputSchema = v.object({
  token: inviteTokenSchema,
  response: registerResponseSchema,
});

export async function handleInviteRegisterOptions(
  ctx: AppContext,
  app: PlumixApp,
): Promise<Response> {
  const input = await parseJson(ctx.request, inviteRegisterOptionsInputSchema);
  if (!input) return invalidInput();

  const target = await resolveInviteTarget(ctx, input.token);
  if (target instanceof Response) return target;
  const { user } = target;

  const options = await beginRegistration(ctx.db, app.passkey, {
    userId: user.id,
    userEmail: user.email,
    userDisplayName: pickDisplayName(input.name, user.name, user.email),
  });
  return jsonResponse({
    options,
    invitee: { email: user.email, role: user.role, name: user.name },
  });
}

export async function handleInviteRegisterVerify(
  ctx: AppContext,
  app: PlumixApp,
): Promise<Response> {
  const input = await parseJson(ctx.request, inviteRegisterVerifyInputSchema);
  if (!input) return invalidInput();

  const target = await resolveInviteTarget(ctx, input.token);
  if (target instanceof Response) return target;
  const { invite, user } = target;

  try {
    const verified = await finishRegistration(
      ctx.db,
      app.passkey,
      input.response,
    );
    // The challenge issued in register/options was bound to invite.userId.
    // A mismatch means the response is for a different user — refuse.
    if (verified.userId === null || verified.userId !== user.id) {
      return jsonResponse({ error: "challenge_mismatch" }, { status: 400 });
    }
    const credential = await persistCredential(ctx.db, {
      userId: user.id,
      verified,
      maxPerUser: app.passkey.maxCredentialsPerUser,
    });
    await consumeInviteToken(ctx.db, invite.tokenHash);
    const { cookieHeader } = await mintSessionAndCookie(ctx, app, user.id);
    // User is fully enrolled (credential persisted, token consumed,
    // session created). Fire after the session exists so handlers that
    // hit the DB can rely on the user being in a stable post-invite
    // state — matches WP's `user_register` firing post-save.
    await ctx.hooks.doAction("user:registered", user);
    await ctx.hooks.doAction(
      "credential:created",
      {
        id: credential.id,
        userId: credential.userId,
        name: credential.name,
        deviceType: credential.deviceType,
        isBackedUp: credential.isBackedUp,
      },
      { actor: { id: user.id, email: user.email, role: user.role } },
    );
    await ctx.hooks.doAction("user:signed_in", user, {
      method: "invite",
      firstSignIn: true,
    });
    return jsonResponse(
      { userId: user.id },
      {
        status: 200,
        headers: { "set-cookie": cookieHeader },
      },
    );
  } catch (error) {
    if (error instanceof PasskeyError) return passkeyError(ctx, error);
    throw error;
  }
}

async function resolveInvite(
  ctx: AppContext,
  rawToken: string,
): Promise<ValidInvite | Response> {
  try {
    return await validateInviteToken(ctx.db, rawToken);
  } catch (error) {
    if (error instanceof InviteError) return inviteErrorResponse(error);
    throw error;
  }
}

/**
 * Fully resolve an invite-accept target: validate the token, load the user,
 * verify they're still enrollable (exists, not disabled, no existing
 * credentials). Returns either a typed `{invite, user}` pair or an already-
 * formed error Response that callers pass straight through.
 */
async function resolveInviteTarget(
  ctx: AppContext,
  rawToken: string,
): Promise<{ invite: ValidInvite; user: User } | Response> {
  const invite = await resolveInvite(ctx, rawToken);
  if (invite instanceof Response) return invite;

  const user = await ctx.db.query.users.findFirst({
    where: eq(users.id, invite.userId),
  });
  if (!user || user.disabledAt) {
    return inviteErrorResponse(InviteError.invalidToken());
  }
  const existingCreds = await ctx.db.$count(
    credentials,
    eq(credentials.userId, user.id),
  );
  if (existingCreds > 0) {
    return jsonResponse({ error: "already_registered" }, { status: 409 });
  }
  return { invite, user };
}

function inviteErrorResponse(error: InviteError): Response {
  const status = error.code === "token_expired" ? 410 : 404;
  return jsonResponse({ error: error.code }, { status });
}

// Pick a WebAuthn display name: invitee's input > admin-set name > email.
// Falsy check (not `??`) so empty strings fall through to the next fallback.
function pickDisplayName(
  userInput: string | undefined,
  existingName: string | null,
  email: string,
): string {
  const trimmed = userInput?.trim();
  if (trimmed) return trimmed;
  if (existingName) return existingName;
  return email;
}
