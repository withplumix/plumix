/**
 * Non-readonly: DOM `PublicKeyCredentialCreationOptions` declares mutable
 * arrays, and this goes straight to `navigator.credentials.create`.
 */
export interface ServerRegistrationOptions {
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

export interface ServerAuthenticationOptions {
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

/** `ArrayBuffer` fields as base64url, the shape the verify endpoints parse. */
interface EncodedCredential {
  readonly id: string;
  readonly rawId: string;
  readonly type: string;
}

export interface EncodedRegistrationCredential extends EncodedCredential {
  readonly response: {
    readonly clientDataJSON: string;
    readonly attestationObject: string;
    readonly transports: readonly string[];
  };
}

export interface EncodedAuthenticationCredential extends EncodedCredential {
  readonly response: {
    readonly clientDataJSON: string;
    readonly authenticatorData: string;
    readonly signature: string;
    readonly userHandle: string | null;
  };
}

/** A prompt the browser refused, as the `authClient` error code it maps to. */
export type CeremonyOutcome<T> =
  { readonly credential: T } | { readonly code: string };

const DOM_EXCEPTION_CODE: Readonly<Record<string, string>> = {
  NotAllowedError: "user_cancelled",
  AbortError: "user_cancelled",
  InvalidStateError: "credential_already_registered",
  NotSupportedError: "no_authenticator",
};

async function callCredentialsApi(
  call: () => Promise<Credential | null>,
): Promise<CeremonyOutcome<PublicKeyCredential>> {
  let raw: Credential | null;
  try {
    raw = await call();
  } catch (error) {
    const code =
      error instanceof DOMException
        ? (DOM_EXCEPTION_CODE[error.name] ?? "unknown")
        : "unknown";
    return { code };
  }
  if (!raw) return { code: "user_cancelled" };
  return { credential: raw as PublicKeyCredential };
}

export async function createCredential(
  options: ServerRegistrationOptions,
): Promise<CeremonyOutcome<EncodedRegistrationCredential>> {
  const outcome = await callCredentialsApi(() =>
    navigator.credentials.create({
      publicKey: {
        ...options,
        challenge: base64urlToBuffer(options.challenge),
        user: { ...options.user, id: base64urlToBuffer(options.user.id) },
        excludeCredentials: options.excludeCredentials?.map((c) => ({
          ...c,
          id: base64urlToBuffer(c.id),
        })),
      },
    }),
  );
  if ("code" in outcome) return outcome;
  const { credential } = outcome;
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    credential: {
      id: credential.id,
      rawId: bufferToBase64url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64url(response.clientDataJSON),
        attestationObject: bufferToBase64url(response.attestationObject),
        transports: response.getTransports(),
      },
    },
  };
}

export async function getCredential(
  options: ServerAuthenticationOptions,
): Promise<CeremonyOutcome<EncodedAuthenticationCredential>> {
  const outcome = await callCredentialsApi(() =>
    navigator.credentials.get({
      publicKey: {
        ...options,
        challenge: base64urlToBuffer(options.challenge),
        allowCredentials: options.allowCredentials?.map((c) => ({
          ...c,
          id: base64urlToBuffer(c.id),
        })),
      },
    }),
  );
  if ("code" in outcome) return outcome;
  const { credential } = outcome;
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    credential: {
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
    },
  };
}

// Base64url (RFC 4648, unpadded), hand-rolled: `Uint8Array.prototype.toBase64`
// is still rolling out across browsers.

export function bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64urlToBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding =
    padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
