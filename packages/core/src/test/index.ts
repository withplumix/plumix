// Public test-harness surface for downstream consumers of `plumix/test`.
// Every symbol here is intended for use from test files in themes, plugins,
// and end-user apps — not from production runtime code.

export {
  userFactory,
  adminUser,
  editorUser,
  authorUser,
  contributorUser,
  subscriberUser,
  postFactory,
  draftPost,
  publishedPost,
  trashedPost,
  termFactory,
  categoryTerm,
  tagTerm,
  inviteFactory,
  credentialFactory,
  factoriesFor,
} from "./factories.js";
export type { Factories } from "./factories.js";

export { createTestDb } from "./harness.js";

export { createDispatcherHarness, plumixRequest } from "./dispatcher.js";

export { createRpcHarness } from "./rpc.js";

// WebAuthn fixtures — build deterministic attestation / assertion payloads
// without touching a real browser. Used by plumix's own passkey tests and
// available for plugin authors extending the auth surface.
export {
  buildAssertion,
  buildAttestation,
  generatePasskeyKeyPair,
  randomCredentialId,
} from "./fixtures/webauthn.js";
export type { PasskeyKeyPair } from "./fixtures/webauthn.js";
