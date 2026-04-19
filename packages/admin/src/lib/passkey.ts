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

// navigator.credentials.get throws a DOMException on user cancellation or
// missing authenticator — normalize those to our taxonomy so the UI only
// ever deals in PasskeyError.
function wrapCredentialsError(err: unknown): never {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "AbortError") {
      throw new PasskeyError("user_cancelled");
    }
    if (err.name === "InvalidStateError") {
      throw new PasskeyError("credential_already_registered");
    }
    if (err.name === "NotSupportedError") {
      throw new PasskeyError("no_authenticator");
    }
  }
  throw new PasskeyError("unknown");
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

  let credential: PublicKeyCredential;
  try {
    const raw = await navigator.credentials.create({
      publicKey: decodeRegistrationOptions(options),
    });
    if (!raw) throw new PasskeyError("user_cancelled");
    credential = raw as PublicKeyCredential;
  } catch (err) {
    if (err instanceof PasskeyError) throw err;
    wrapCredentialsError(err);
  }

  return postJson<VerifySuccess>(
    "/_plumix/auth/passkey/register/verify",
    encodeRegistrationCredential(credential),
  );
}

export async function signInWithPasskey(
  email?: string,
): Promise<VerifySuccess> {
  const options = await postJson<ServerAuthenticationOptions>(
    "/_plumix/auth/passkey/login/options",
    email ? { email } : {},
  );

  let credential: PublicKeyCredential;
  try {
    const raw = await navigator.credentials.get({
      publicKey: decodeAuthenticationOptions(options),
    });
    if (!raw) throw new PasskeyError("user_cancelled");
    credential = raw as PublicKeyCredential;
  } catch (err) {
    if (err instanceof PasskeyError) throw err;
    wrapCredentialsError(err);
  }

  return postJson<VerifySuccess>(
    "/_plumix/auth/passkey/login/verify",
    encodeAuthenticationCredential(credential),
  );
}

export async function signOut(): Promise<void> {
  await postJsonVoid("/_plumix/auth/signout");
}
