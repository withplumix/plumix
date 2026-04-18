import * as v from "valibot";

import type { AppContext } from "../../context/app.js";
import type { User } from "../../db/schema/users.js";
import type { PlumixApp } from "../../runtime/app.js";
import type { ValidInvite } from "../invite.js";
import type { AuthenticationResponse, RegistrationResponse } from "./types.js";
import { eq, isUniqueConstraintError } from "../../db/index.js";
import { credentials } from "../../db/schema/credentials.js";
import { users } from "../../db/schema/users.js";
import { jsonResponse } from "../../runtime/http.js";
import { provisionUser } from "../bootstrap.js";
import {
  buildSessionCookie,
  buildSessionDeletionCookie,
  isSecureRequest,
  readSessionCookie,
} from "../cookies.js";
import {
  consumeInviteToken,
  InviteError,
  validateInviteToken,
} from "../invite.js";
import {
  createSession,
  invalidateSession,
  validateSession,
} from "../sessions.js";
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

const MAX_CREDENTIAL_ID_LENGTH = 1024;
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

function sessionCookieHeader(
  ctx: AppContext,
  app: PlumixApp,
  token: string,
): string {
  return buildSessionCookie(token, {
    maxAgeSeconds: app.sessionPolicy.maxAgeSeconds,
    secure: isSecureRequest(ctx.request),
    sameSite: "Lax",
  });
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
    const verified = await finishRegistration(
      ctx.db,
      app.passkey,
      payload as RegistrationResponse,
    );
    if (verified.userId === null) {
      return jsonResponse(
        { error: "challenge_not_bound_to_user" },
        { status: 400 },
      );
    }

    await persistCredential(ctx.db, {
      userId: verified.userId,
      verified,
      maxPerUser: app.passkey.maxCredentialsPerUser,
    });

    const { token } = await createSession(
      ctx.db,
      { userId: verified.userId },
      app.sessionPolicy,
    );
    return jsonResponse(
      { userId: verified.userId },
      {
        status: 200,
        headers: { "set-cookie": sessionCookieHeader(ctx, app, token) },
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

    const { token } = await createSession(
      ctx.db,
      { userId: verified.credential.userId },
      app.sessionPolicy,
    );

    return jsonResponse(
      { userId: verified.credential.userId },
      {
        status: 200,
        headers: { "set-cookie": sessionCookieHeader(ctx, app, token) },
      },
    );
  } catch (error) {
    if (error instanceof PasskeyError) return passkeyError(ctx, error);
    throw error;
  }
}

export async function handleSignout(ctx: AppContext): Promise<Response> {
  const token = readSessionCookie(ctx.request);
  if (token) await invalidateSession(ctx.db, token);
  const cookie = buildSessionDeletionCookie({
    secure: isSecureRequest(ctx.request),
    sameSite: "Lax",
  });
  return jsonResponse(
    { ok: true },
    { status: 200, headers: { "set-cookie": cookie } },
  );
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
      input.response as RegistrationResponse,
    );
    // The challenge issued in register/options was bound to invite.userId.
    // A mismatch means the response is for a different user — refuse.
    if (verified.userId === null || verified.userId !== user.id) {
      return jsonResponse({ error: "challenge_mismatch" }, { status: 400 });
    }
    await persistCredential(ctx.db, {
      userId: user.id,
      verified,
      maxPerUser: app.passkey.maxCredentialsPerUser,
    });
    await consumeInviteToken(ctx.db, invite.tokenHash);
    const { token } = await createSession(
      ctx.db,
      { userId: user.id },
      app.sessionPolicy,
    );
    return jsonResponse(
      { userId: user.id },
      {
        status: 200,
        headers: { "set-cookie": sessionCookieHeader(ctx, app, token) },
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
    return inviteErrorResponse(new InviteError("invalid_token"));
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
  if (trimmed && trimmed.length > 0) return trimmed;
  if (existingName && existingName.length > 0) return existingName;
  return email;
}
