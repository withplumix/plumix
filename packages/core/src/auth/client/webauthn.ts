import { decodeBase64url, encodeBase64url } from "../../encoding.js";

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
        challenge: decodeBase64url(options.challenge),
        user: { ...options.user, id: decodeBase64url(options.user.id) },
        excludeCredentials: options.excludeCredentials?.map((c) => ({
          ...c,
          id: decodeBase64url(c.id),
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
      rawId: encodeBase64url(new Uint8Array(credential.rawId)),
      type: credential.type,
      response: {
        clientDataJSON: encodeBase64url(
          new Uint8Array(response.clientDataJSON),
        ),
        attestationObject: encodeBase64url(
          new Uint8Array(response.attestationObject),
        ),
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
        challenge: decodeBase64url(options.challenge),
        allowCredentials: options.allowCredentials?.map((c) => ({
          ...c,
          id: decodeBase64url(c.id),
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
      rawId: encodeBase64url(new Uint8Array(credential.rawId)),
      type: credential.type,
      response: {
        clientDataJSON: encodeBase64url(
          new Uint8Array(response.clientDataJSON),
        ),
        authenticatorData: encodeBase64url(
          new Uint8Array(response.authenticatorData),
        ),
        signature: encodeBase64url(new Uint8Array(response.signature)),
        userHandle: response.userHandle?.byteLength
          ? encodeBase64url(new Uint8Array(response.userHandle))
          : null,
      },
    },
  };
}
