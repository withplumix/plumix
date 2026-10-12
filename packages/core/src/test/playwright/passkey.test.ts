import type { CDPSession } from "@playwright/test";
import { describe, expect, test } from "vitest";

import { addVirtualPasskey } from "./passkey.js";

interface FakeCredential {
  readonly credentialId: string;
  readonly rpId: string;
  readonly signCount: number;
}

/** Chromium's WebAuthn domain, as far as the fixture drives it. */
function fakeWebAuthn() {
  const authenticators = new Map<string, FakeCredential[]>();
  const session = {
    send: (method: string, params?: { authenticatorId?: string }) => {
      switch (method) {
        case "WebAuthn.enable":
          return Promise.resolve({});
        case "WebAuthn.addVirtualAuthenticator": {
          const authenticatorId = `authenticator-${String(authenticators.size + 1)}`;
          authenticators.set(authenticatorId, []);
          return Promise.resolve({ authenticatorId });
        }
        case "WebAuthn.removeVirtualAuthenticator":
          authenticators.delete(params?.authenticatorId ?? "");
          return Promise.resolve({});
        case "WebAuthn.getCredentials":
          return Promise.resolve({
            credentials: authenticators.get(params?.authenticatorId ?? ""),
          });
        default:
          return Promise.reject(new Error(`unexpected ${method}`));
      }
    },
  };
  // Safety: the fixture calls only `send`, with the WebAuthn methods above.
  return { authenticators, session: session as unknown as CDPSession };
}

describe("addVirtualPasskey", () => {
  test("holds no credentials before a ceremony", async () => {
    const webAuthn = fakeWebAuthn();
    const { passkey } = await addVirtualPasskey("chromium", () =>
      Promise.resolve(webAuthn.session),
    );

    expect(await passkey.credentials()).toEqual([]);
  });

  test("lists the credential a ceremony stored", async () => {
    const webAuthn = fakeWebAuthn();
    const { passkey } = await addVirtualPasskey("chromium", () =>
      Promise.resolve(webAuthn.session),
    );
    webAuthn.authenticators
      .get("authenticator-1")
      ?.push({ credentialId: "Y3JlZA==", rpId: "localhost", signCount: 0 });

    expect(await passkey.credentials()).toEqual([
      { credentialId: "Y3JlZA==", rpId: "localhost", signCount: 0 },
    ]);
  });

  test("removing it takes the authenticator off the page", async () => {
    const webAuthn = fakeWebAuthn();
    const device = await addVirtualPasskey("chromium", () =>
      Promise.resolve(webAuthn.session),
    );

    await device.remove();

    expect([...webAuthn.authenticators.keys()]).toEqual([]);
  });

  test("outside Chromium, asking for one throws, naming the browser", async () => {
    const webAuthn = fakeWebAuthn();

    await expect(
      addVirtualPasskey("firefox", () => Promise.resolve(webAuthn.session)),
    ).rejects.toThrow(
      'The passkey fixture needs Chromium, which has virtual authenticators; this project runs "firefox".',
    );
  });
});
