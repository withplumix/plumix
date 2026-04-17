import type { CredentialTransport } from "../../db/schema/credentials.js";

// WebAuthn options shapes — what the server hands the browser. Mirrors the
// PublicKeyCredentialCreationOptions / RequestOptions shape but with strings
// (base64url-encoded) instead of ArrayBuffers, so it serializes to JSON.

export interface PublicKeyCredentialDescriptor {
  readonly type: "public-key";
  readonly id: string;
  readonly transports?: readonly CredentialTransport[];
}

export interface RegistrationOptions {
  readonly challenge: string;
  readonly rp: { readonly name: string; readonly id: string };
  readonly user: {
    readonly id: string;
    readonly name: string;
    readonly displayName: string;
  };
  readonly pubKeyCredParams: readonly {
    readonly type: "public-key";
    readonly alg: number;
  }[];
  readonly timeout?: number;
  readonly attestation: "none";
  readonly authenticatorSelection?: {
    readonly residentKey?: "discouraged" | "preferred" | "required";
    readonly userVerification?: "discouraged" | "preferred" | "required";
  };
  readonly excludeCredentials?: readonly PublicKeyCredentialDescriptor[];
}

export interface AuthenticationOptions {
  readonly challenge: string;
  readonly rpId: string;
  readonly timeout?: number;
  readonly userVerification?: "discouraged" | "preferred" | "required";
  readonly allowCredentials?: readonly PublicKeyCredentialDescriptor[];
}

// What the browser POSTs back. Already base64url-decoded structurally where
// the spec uses ArrayBuffer.

export interface RegistrationResponse {
  readonly id: string;
  readonly rawId: string;
  readonly type: "public-key";
  readonly response: {
    readonly clientDataJSON: string;
    readonly attestationObject: string;
    readonly transports?: readonly CredentialTransport[];
  };
}

export interface AuthenticationResponse {
  readonly id: string;
  readonly rawId: string;
  readonly type: "public-key";
  readonly response: {
    readonly clientDataJSON: string;
    readonly authenticatorData: string;
    readonly signature: string;
    readonly userHandle?: string;
  };
}
