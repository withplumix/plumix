import * as v from "valibot";

import type { AppContext } from "../../context/app-context.js";
import type { User } from "../../db/schema/users.js";
import type { AuthFlowApp } from "../flow-app.js";
import type { ValidInvite } from "../invite.js";
import type { AuthenticationResponse } from "./types.js";
import { withBasePath } from "../../base-path.js";
import { eq, isUniqueConstraintError } from "../../db/index.js";
import { credentials } from "../../db/schema/credentials.js";
import { users } from "../../db/schema/users.js";
import { startingMeta } from "../../plugin/fields/starting-meta.js";
import { listUserMetaFields } from "../../plugin/manifest.js";
import { jsonResponse } from "../../runtime/contract/http.js";
import { authenticateSession } from "../authenticator.js";
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
import { announceSignIn, mintSessionAndCookie } from "../sign-in.js";
import { beginAuthentication, finishAuthentication } from "./authenticate.js";
import { resolvePasskeyOrigins } from "./config.js";
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

// Real credential IDs are at most a few hundred bytes; the cap blocks
// pathological payloads.
const MAX_CREDENTIAL_ID_LENGTH = 1024;
// Generous for interoperability, but stops oversized binary fields reaching the
// oslo parsers.
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
      meta: startingMeta(listUserMetaFields(ctx.plugins)),
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
  app: AuthFlowApp,
): Promise<Response> {
  const input = await parseJson(ctx.request, registerOptionsInputSchema);
  if (!input) return invalidInput();

  const authed = (await authenticateSession(ctx))?.user ?? null;
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

  const passkey = resolvePasskeyOrigins(app.passkey, ctx.env);
  const options = await beginRegistration(ctx.db, passkey, {
    userId: user.id,
    userEmail: user.email,
    userDisplayName: user.name ?? user.email,
    excludeCredentials,
    ceremony: policy.outcome,
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

export async function handlePasskeyRegisterVerify(
  ctx: AppContext,
  app: AuthFlowApp,
): Promise<Response> {
  const payload = await parseJson(ctx.request, registerResponseSchema);
  if (!payload) return invalidInput();

  const passkey = resolvePasskeyOrigins(app.passkey, ctx.env);
  try {
    const verified = await finishRegistration(ctx.db, passkey, payload);
    if (verified.userId === null) {
      return jsonResponse(
        { error: "challenge_not_bound_to_user" },
        { status: 400 },
      );
    }
    // An invite challenge completed here would enrol the invitee without
    // consuming the token or running invite verify's checks (#2402).
    if (
      verified.ceremony !== "bootstrap" &&
      verified.ceremony !== "add-device"
    ) {
      return jsonResponse({ error: "challenge_mismatch" }, { status: 400 });
    }

    const credential = await persistCredential(ctx.db, {
      userId: verified.userId,
      verified,
      maxPerUser: passkey.maxCredentialsPerUser,
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
      await ctx.hooks.doAction(
        "credential:created",
        {
          id: credential.id,
          userId: credential.userId,
          name: credential.name,
          deviceType: credential.deviceType,
          isBackedUp: credential.isBackedUp,
        },
        {
          actor: {
            id: user.id,
            email: user.email,
            role: user.role,
            meta: user.meta,
          },
        },
        ctx,
      );
      await announceSignIn(ctx, user, {
        method: "passkey",
        firstSignIn: verified.ceremony === "bootstrap",
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
  app: AuthFlowApp,
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

  const passkey = resolvePasskeyOrigins(app.passkey, ctx.env);
  const options = await beginAuthentication(ctx.db, passkey, {
    allowCredentials,
  });
  return jsonResponse(options);
}

export async function handlePasskeyLoginVerify(
  ctx: AppContext,
  app: AuthFlowApp,
): Promise<Response> {
  const payload = await parseJson(ctx.request, authenticationResponseSchema);
  if (!payload) return invalidInput();

  try {
    const passkey = resolvePasskeyOrigins(app.passkey, ctx.env);
    const verified = await finishAuthentication(
      ctx.db,
      passkey,
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
      await announceSignIn(ctx, user, {
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

export async function handleSignout(
  ctx: AppContext,
  app: AuthFlowApp,
): Promise<Response> {
  const token = readSessionCookie(ctx.request);
  if (token) {
    // Resolve the user before invalidating so the hook payload carries
    // the row that was just signed out (for audit attribution).
    const validated = await validateSession(ctx.db, token, app.sessionPolicy);
    await invalidateSession(ctx.db, token);
    if (validated) {
      await ctx.hooks.doAction("user:signed_out", validated.user, ctx);
    }
  }
  const cookie = buildSessionDeletionCookie({
    secure: isSecureRequest(ctx.request),
    sameSite: "Lax",
    // Must match the Path the session was minted with (see
    // mintSessionAndCookie) or the browser won't clear it.
    path: withBasePath("/", ctx.config.basePath),
  });
  // Without the IdP logout URL, an external session (CF Access, SAML) would
  // silently re-authenticate the next request.
  const redirectTo = sanitiseSignOutUrl(
    ctx.authenticator.signOutUrl?.(ctx.request),
  );
  return jsonResponse(
    { ok: true, redirectTo },
    { status: 200, headers: { "set-cookie": cookie } },
  );
}

// The authenticator is operator-trusted, but a buggy one returning
// `javascript:` or CR/LF would become a trusted navigation target.
function sanitiseSignOutUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (/[\r\n]/.test(value)) return null;
  const sameOriginPath = value.startsWith("/") && !value.startsWith("//");
  const httpsAbsolute = value.startsWith("https://");
  return sameOriginPath || httpsAbsolute ? value : null;
}

// An invite unlocks registration that is otherwise closed after bootstrap. TTL
// is rechecked at verify because a slow client can outlast it.

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
  app: AuthFlowApp,
): Promise<Response> {
  const input = await parseJson(ctx.request, inviteRegisterOptionsInputSchema);
  if (!input) return invalidInput();

  const target = await resolveInviteTarget(ctx, input.token);
  if (target instanceof Response) return target;
  const { user } = target;

  const passkey = resolvePasskeyOrigins(app.passkey, ctx.env);
  const options = await beginRegistration(ctx.db, passkey, {
    userId: user.id,
    userEmail: user.email,
    userDisplayName: pickDisplayName(input.name, user.name, user.email),
    ceremony: "invite",
  });
  return jsonResponse({
    options,
    invitee: { email: user.email, role: user.role, name: user.name },
  });
}

export async function handleInviteRegisterVerify(
  ctx: AppContext,
  app: AuthFlowApp,
): Promise<Response> {
  const input = await parseJson(ctx.request, inviteRegisterVerifyInputSchema);
  if (!input) return invalidInput();

  const target = await resolveInviteTarget(ctx, input.token);
  if (target instanceof Response) return target;
  const { invite, user } = target;

  try {
    const passkey = resolvePasskeyOrigins(app.passkey, ctx.env);
    const verified = await finishRegistration(ctx.db, passkey, input.response);
    // The challenge issued in invite register/options was bound to
    // invite.userId. A different user or a passkey-route challenge means the
    // response belongs to another ceremony — refuse.
    if (verified.ceremony !== "invite" || verified.userId !== user.id) {
      return jsonResponse({ error: "challenge_mismatch" }, { status: 400 });
    }
    const credential = await persistCredential(ctx.db, {
      userId: user.id,
      verified,
      maxPerUser: passkey.maxCredentialsPerUser,
    });
    await consumeInviteToken(ctx.db, invite.tokenHash);
    const { cookieHeader } = await mintSessionAndCookie(ctx, app, user.id);
    // Fired after the session exists so handlers see a fully enrolled user.
    await ctx.hooks.doAction("user:registered", user, ctx);
    await ctx.hooks.doAction(
      "credential:created",
      {
        id: credential.id,
        userId: credential.userId,
        name: credential.name,
        deviceType: credential.deviceType,
        isBackedUp: credential.isBackedUp,
      },
      {
        actor: {
          id: user.id,
          email: user.email,
          role: user.role,
          meta: user.meta,
        },
      },
      ctx,
    );
    await announceSignIn(ctx, user, { method: "invite", firstSignIn: true });
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

// A user with any credential is refused: an invite is not for re-registration.
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
