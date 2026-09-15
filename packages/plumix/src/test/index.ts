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
