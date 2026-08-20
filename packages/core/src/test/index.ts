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
  entryFactory,
  draftEntry,
  publishedEntry,
  trashedEntry,
  termFactory,
  categoryTerm,
  tagTerm,
  inviteFactory,
  credentialFactory,
  sessionFactory,
  settingFactory,
  entryTermFactory,
  allowedDomainFactory,
  apiTokenFactory,
  authTokenFactory,
  oauthAccountFactory,
  deviceCodeFactory,
  factoriesFor,
} from "./factories.js";
export type { Factories } from "./factories.js";

export { applyTestSchema, createTestDb } from "./harness.js";

export { createDispatcherHarness, plumixRequest } from "./dispatcher.js";
export type {
  DispatcherHarness,
  CreateDispatcherHarnessOptions,
} from "./dispatcher.js";

export { createTestContext } from "./context.js";
export type { CreateTestContextOptions } from "./context.js";

export { createTracedContext } from "./traced-context.js";
export type { TracedContext } from "./traced-context.js";

// Real request-memo implementation for the AppContext stand-ins that predate
// `createTestContext` — service functions read through `ctx.memo`, so a
// hand-rolled stand-in needs one. New tests should take the factory instead.
export { createRequestMemo } from "../context/memo.js";

export { createDeferQueue } from "./defer.js";
export type { DeferQueue } from "./defer.js";

export { createRpcHarness } from "./rpc.js";
export type {
  RpcHarness,
  AuthenticatedRpcHarness,
  RpcHarnessBase,
  BaseRpcHarnessOptions,
  AuthenticatedHarnessOptions,
} from "./rpc.js";

export { buildRequest, TestResponse } from "./request.js";
export type { FetchOptions } from "./request.js";

export { spyAction, spyFilter, expectError } from "./spies.js";
export type { ActionSpy, ActionCall, FilterSpy, FilterCall } from "./spies.js";

export { deepEqual, partialMatch } from "./match.js";

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
