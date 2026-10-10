// Exports every name the Node build does, so one import serves both tiers. A
// harness needing a database or Node built-in throws, naming its tier.

import type * as node from "./index.js";

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
} from "@plumix/core/test/browser";

export {
  buildRequest,
  createDeferQueue,
  DEV_ORIGIN,
  plumixRequest,
  TestResponse,
  toRegisteredEntryType,
  toRegisteredTermTaxonomy,
} from "@plumix/core/test/browser";

export {
  deepEqual,
  expectError,
  partialMatch,
  spyAction,
  spyFilter,
} from "@plumix/core/test/browser";

export { PluginRpcError, stubPluginRpc } from "./plugin-rpc.js";

export { fakeFile, fakeImage } from "./fakes.js";

export {
  EMPTY_CONTEXT,
  mockRegistry,
  renderBlockSpecToHtml,
  renderBlockTreeToHtml,
} from "@plumix/core/blocks/test";

function nodeOnly(name: string): (...args: readonly unknown[]) => never {
  return () => {
    throw new Error(
      `${name} runs in Node — this test belongs in a \`*.test.ts\` file, ` +
        "not `*.browser.test.tsx`.",
    );
  };
}

export const applyCoreTestSchema: typeof node.applyCoreTestSchema = nodeOnly(
  "applyCoreTestSchema",
);
export const applyTestSchema: typeof node.applyTestSchema =
  nodeOnly("applyTestSchema");
export const createTestDb: typeof node.createTestDb = nodeOnly("createTestDb");
export const createDispatcherHarness: typeof node.createDispatcherHarness =
  nodeOnly("createDispatcherHarness");
export const createRpcHarness: typeof node.createRpcHarness =
  nodeOnly("createRpcHarness");
export const createTestContext: typeof node.createTestContext =
  nodeOnly("createTestContext");
export const createTracedContext: typeof node.createTracedContext = nodeOnly(
  "createTracedContext",
);
export const generateSchemaSource: typeof node.generateSchemaSource = nodeOnly(
  "generateSchemaSource",
);
export const buildAssertion: typeof node.buildAssertion =
  nodeOnly("buildAssertion");
export const buildAttestation: typeof node.buildAttestation =
  nodeOnly("buildAttestation");
export const generatePasskeyKeyPair: typeof node.generatePasskeyKeyPair =
  nodeOnly("generatePasskeyKeyPair");
export const randomCredentialId: typeof node.randomCredentialId =
  nodeOnly("randomCredentialId");
