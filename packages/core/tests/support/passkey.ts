import type { PasskeyKeyPair } from "../../src/test/fixtures/webauthn.js";
import type { TestPage } from "../../src/test/page.js";
import type { TestSite } from "../../src/test/site.js";
import {
  buildAssertion,
  buildRegisterVerifyEnvelope,
  generatePasskeyKeyPair,
  randomCredentialId,
} from "../../src/test/fixtures/webauthn.js";

/** Who a request goes as: `site`, or `site.actingAs(...)`. */
export type Visitor = Pick<TestSite, "visit">;

/** Posts `json` to `path` the way the auth client's fetch does. */
export function postJson(
  as: Visitor,
  path: string,
  json: unknown,
  headers: Record<string, string> = {},
): Promise<TestPage> {
  return as.visit(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(json),
  });
}

/** The challenge a passkey options answer carries. */
export function challengeOf(page: TestPage): string {
  const { challenge } = JSON.parse(page.body) as { challenge: string };
  return challenge;
}

/** An attestation over `challenge` from a fresh key, as the browser sends it. */
export function attestationFor(challenge: string) {
  return buildRegisterVerifyEnvelope({
    keyPair: generatePasskeyKeyPair(),
    rpId: "cms.example",
    origin: "https://cms.example",
    challenge,
    credentialId: randomCredentialId(),
  });
}

export interface EnrolledPasskey {
  readonly keyPair: PasskeyKeyPair;
  readonly credentialId: string;
  /** What register verify answered. */
  readonly registered: TestPage;
}

/** Bootstraps `email` with a passkey and hands back what signs in with it. */
export async function enrolPasskey(
  as: Visitor,
  email: string,
): Promise<EnrolledPasskey> {
  const keyPair = generatePasskeyKeyPair();
  const options = await postJson(as, "/_plumix/auth/passkey/register/options", {
    email,
  });
  const envelope = buildRegisterVerifyEnvelope({
    keyPair,
    rpId: "cms.example",
    origin: "https://cms.example",
    challenge: challengeOf(options),
    credentialId: randomCredentialId(),
  });
  const registered = await postJson(
    as,
    "/_plumix/auth/passkey/register/verify",
    envelope,
  );
  return { keyPair, credentialId: envelope.id, registered };
}

/** Signs in with an enrolled passkey: login options, then login verify. */
export async function signInWithPasskey(
  as: Visitor,
  enrolled: EnrolledPasskey,
  query = "",
): Promise<TestPage> {
  const options = await postJson(as, "/_plumix/auth/passkey/login/options", {});
  const assertion = buildAssertion({
    keyPair: enrolled.keyPair,
    rpId: "cms.example",
    origin: "https://cms.example",
    challenge: challengeOf(options),
    counter: 1,
  });
  return postJson(as, `/_plumix/auth/passkey/login/verify${query}`, {
    id: enrolled.credentialId,
    rawId: enrolled.credentialId,
    type: "public-key",
    response: {
      clientDataJSON: assertion.clientDataJSON,
      authenticatorData: assertion.authenticatorData,
      signature: assertion.signature,
    },
  });
}
