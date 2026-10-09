export type * from "@plumix/core/test";

// Factories for every core table, and the db-bound bundle.
export {
  adminUser,
  allowedDomainFactory,
  apiTokenFactory,
  authorUser,
  authTokenFactory,
  categoryTerm,
  contributorUser,
  credentialFactory,
  deviceCodeFactory,
  draftEntry,
  editorUser,
  entryFactory,
  entryTermFactory,
  factoriesFor,
  inviteFactory,
  oauthAccountFactory,
  publishedEntry,
  sessionFactory,
  settingFactory,
  subscriberUser,
  tagTerm,
  termFactory,
  trashedEntry,
  userFactory,
} from "@plumix/core/test";

// Databases, harnesses, contexts and requests.
export {
  applyCoreTestSchema,
  applyTestSchema,
  buildRequest,
  createDeferQueue,
  createDispatcherHarness,
  createRpcHarness,
  createTestContext,
  createTestDb,
  createTracedContext,
  DEV_ORIGIN,
  generateSchemaSource,
  memoryCdn,
  plumixRequest,
  TestResponse,
  toRegisteredEntryType,
  toRegisteredTermTaxonomy,
} from "@plumix/core/test";

// Hook spies, matchers and WebAuthn fixtures.
export {
  buildAssertion,
  buildAttestation,
  deepEqual,
  expectError,
  generatePasskeyKeyPair,
  partialMatch,
  randomCredentialId,
  spyAction,
  spyFilter,
} from "@plumix/core/test";

// Serving a plugin's own RPC procedures to its admin code under test.
export { PluginRpcError, stubPluginRpc } from "./plugin-rpc.js";
export type { PluginRpcCall, PluginRpcStub } from "./plugin-rpc.js";

// Rendering a block, or a tree of them, to HTML.
export {
  EMPTY_CONTEXT,
  mockRegistry,
  renderBlockSpecToHtml,
  renderBlockTreeToHtml,
} from "@plumix/core/blocks/test";

// Upload fakes: a real `File` for an upload field, a drop or a procedure.
export { fakeFile, fakeImage } from "./fakes.js";
export type { FakeFileOptions, FakeImageOptions } from "./fakes.js";
