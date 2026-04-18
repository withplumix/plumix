import * as v from "valibot";

import type { AppContext } from "../../context/app.js";
import type { User } from "../../db/schema/users.js";
import type { PlumixApp } from "../../runtime/app.js";
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

function passkeyError(error: PasskeyError): Response {
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
    if (error instanceof PasskeyError) return passkeyError(error);
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
    if (error instanceof PasskeyError) return passkeyError(error);
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
