import type { CDPSession } from "@playwright/test";

/** A credential the virtual authenticator holds, as CDP reports it. */
interface PasskeyCredential {
  /** Base64 of the credential's raw id. */
  readonly credentialId: string;
  readonly rpId?: string;
  readonly signCount: number;
}

/**
 * The user's device: a Chromium virtual authenticator that signs in and
 * registers in place of hardware.
 */
export interface Passkey {
  /** The credentials the authenticator holds. */
  credentials(): Promise<readonly PasskeyCredential[]>;
}

interface VirtualPasskey {
  readonly passkey: Passkey;
  /** Takes the authenticator off the page. */
  remove(): Promise<void>;
}

export async function addVirtualPasskey(
  browserName: string,
  openSession: () => Promise<CDPSession>,
): Promise<VirtualPasskey> {
  if (browserName !== "chromium") {
    throw new Error(
      `The passkey fixture needs Chromium, which has virtual authenticators; this project runs "${browserName}".`,
    );
  }
  const cdp = await openSession();
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  return {
    passkey: {
      credentials: async () =>
        (await cdp.send("WebAuthn.getCredentials", { authenticatorId }))
          .credentials,
    },
    remove: async () => {
      await cdp.send("WebAuthn.removeVirtualAuthenticator", {
        authenticatorId,
      });
    },
  };
}
