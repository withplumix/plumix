import type { PasskeyErrorCode } from "./passkey-errors.js";
import { base64urlToBuffer, bufferToBase64url } from "./base64url.js";
import { PasskeyError } from "./passkey-errors.js";

// Dispatcher accepts non-safe /_plumix/* only when this header is present
// (CSRF double-submit token). Every passkey HTTP call needs it.
const PLUMIX_CSRF_HEADER = { "x-plumix-request": "1" } as const;

// Non-readonly: DOM `PublicKeyCredentialCreationOptions` declares mutable
// arrays, and we hand this straight to `navigator.credentials.create`.
interface ServerRegistrationOptions {
  rp: { id?: string; name: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: { type: "public-key"; alg: number }[];
  timeout?: number;
  attestation?: "none";
  authenticatorSelection?: {
    authenticatorAttachment?: "platform" | "cross-platform";
    residentKey?: "discouraged" | "preferred" | "required";
    requireResidentKey?: boolean;
    userVerification?: "discouraged" | "preferred" | "required";
  };
  excludeCredentials?: {
    type: "public-key";
    id: string;
    transports?: AuthenticatorTransport[];
  }[];
}

interface ServerAuthenticationOptions {
  rpId?: string;
  challenge: string;
  timeout?: number;
  userVerification?: "discouraged" | "preferred" | "required";
  allowCredentials?: {
    type: "public-key";
    id: string;
    transports?: AuthenticatorTransport[];
  }[];
}

interface VerifySuccess {
  readonly userId: number;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...PLUMIX_CSRF_HEADER },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PasskeyError("network_error");
  }
  if (!response.ok) {
    let code: PasskeyErrorCode = "unknown";
    try {
      const payload = (await response.json()) as { error?: string };
      if (typeof payload.error === "string") {
        code = payload.error as PasskeyErrorCode;
      }
    } catch {
      // body wasn't JSON; fall through with "unknown"
    }
    throw new PasskeyError(code);
  }
  return (await response.json()) as T;
}

async function postJsonVoid(path: string): Promise<void> {
  try {
    await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: PLUMIX_CSRF_HEADER,
    });
  } catch {
    throw new PasskeyError("network_error");
  }
}

// navigator.credentials.get/create throws a DOMException on user cancellation
// or missing authenticator — normalize via lookup table so the UI only ever
// deals in PasskeyError.
const DOM_EXCEPTION_CODE: Record<string, PasskeyErrorCode> = {
  NotAllowedError: "user_cancelled",
  AbortError: "user_cancelled",
  InvalidStateError: "credential_already_registered",
  NotSupportedError: "no_authenticator",
};

// Wraps a `navigator.credentials.*` call: normalizes a null result (user
// cancelled) and any DOMException into a `PasskeyError`. Returns the
// non-null credential on success.
async function callCredentialsApi(
  call: () => Promise<Credential | null>,
): Promise<PublicKeyCredential> {
  let raw: Credential | null;
  try {
    raw = await call();
  } catch (err) {
    const code =
      err instanceof DOMException
        ? (DOM_EXCEPTION_CODE[err.name] ?? "unknown")
        : "unknown";
    throw new PasskeyError(code);
  }
  if (!raw) throw new PasskeyError("user_cancelled");
  return raw as PublicKeyCredential;
}

function decodeRegistrationOptions(
  opts: ServerRegistrationOptions,
): PublicKeyCredentialCreationOptions {
  return {
    ...opts,
    challenge: base64urlToBuffer(opts.challenge),
    user: { ...opts.user, id: base64urlToBuffer(opts.user.id) },
    excludeCredentials: opts.excludeCredentials?.map((c) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    })),
  };
}

function decodeAuthenticationOptions(
  opts: ServerAuthenticationOptions,
): PublicKeyCredentialRequestOptions {
  return {
    ...opts,
    challenge: base64urlToBuffer(opts.challenge),
    allowCredentials: opts.allowCredentials?.map((c) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    })),
  };
}

function encodeRegistrationCredential(
  credential: PublicKeyCredential,
): unknown {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      attestationObject: bufferToBase64url(response.attestationObject),
      transports: response.getTransports(),
    },
  };
}

function encodeAuthenticationCredential(
  credential: PublicKeyCredential,
): unknown {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      authenticatorData: bufferToBase64url(response.authenticatorData),
      signature: bufferToBase64url(response.signature),
      userHandle: response.userHandle?.byteLength
        ? bufferToBase64url(response.userHandle)
        : null,
    },
  };
}

export async function registerWithPasskey(input: {
  email: string;
  name?: string;
}): Promise<VerifySuccess> {
  const options = await postJson<ServerRegistrationOptions>(
    "/_plumix/auth/passkey/register/options",
    { email: input.email, ...(input.name ? { name: input.name } : {}) },
  );

  const credential = await callCredentialsApi(() =>
    navigator.credentials.create({
      publicKey: decodeRegistrationOptions(options),
    }),
  );

  return postJson<VerifySuccess>(
    "/_plumix/auth/passkey/register/verify",
    encodeRegistrationCredential(credential),
  );
}

// Server pairs the registration options with a compact `invitee` preview
// so the accept-invite screen can confirm the target email / role before
// the user taps their passkey.
interface InviteeSummary {
  readonly email: string;
  readonly role: string;
  readonly name: string | null;
}

interface InviteOptionsResponse {
  readonly options: ServerRegistrationOptions;
  readonly invitee: InviteeSummary;
}

interface InviteAcceptSuccess extends VerifySuccess {
  readonly invitee: InviteeSummary;
}

/**
 * Two-step invite acceptance: fetch passkey-registration options keyed to
 * the invite token, prompt the authenticator, then POST the attestation
 * back for verification. A successful verify creates the user session
 * (cookie set by the server) and consumes the token — a second attempt
 * with the same token returns `invalid_token`.
 */
export async function acceptInviteWithPasskey(input: {
  token: string;
  name?: string;
}): Promise<InviteAcceptSuccess> {
  const { options, invitee } = await postJson<InviteOptionsResponse>(
    "/_plumix/auth/invite/register/options",
    {
      token: input.token,
      ...(input.name ? { name: input.name } : {}),
    },
  );

  const credential = await callCredentialsApi(() =>
    navigator.credentials.create({
      publicKey: decodeRegistrationOptions(options),
    }),
  );

  // Invite-verify nests the credential under `response` (see
  // `inviteRegisterVerifyInputSchema` server-side). This differs from the
  // non-invite `passkey/register/verify` endpoint which takes the
  // credential at the top level.
  const verified = await postJson<VerifySuccess>(
    "/_plumix/auth/invite/register/verify",
    {
      token: input.token,
      response: encodeRegistrationCredential(credential),
    },
  );

  return { ...verified, invitee };
}

export async function signInWithPasskey(
  email?: string,
): Promise<VerifySuccess> {
  const options = await postJson<ServerAuthenticationOptions>(
    "/_plumix/auth/passkey/login/options",
    email ? { email } : {},
  );

  const credential = await callCredentialsApi(() =>
    navigator.credentials.get({
      publicKey: decodeAuthenticationOptions(options),
    }),
  );

  return postJson<VerifySuccess>(
    "/_plumix/auth/passkey/login/verify",
    encodeAuthenticationCredential(credential),
  );
}

export async function signOut(): Promise<void> {
  await postJsonVoid("/_plumix/auth/signout");
}
