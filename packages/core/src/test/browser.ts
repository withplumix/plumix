// The share of the test surface a browser bundle can carry: nothing here
// reaches a database, the dispatcher or a Node built-in. `plumix/test`'s
// browser build takes its real values from here and answers every other name
// with an error pointing the test back at the Node tier.

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

export {
  toRegisteredEntryType,
  toRegisteredTermTaxonomy,
} from "../plugin/registry.js";

export { createDeferQueue } from "./defer.js";

export { DEV_ORIGIN, plumixRequest } from "./plumix-request.js";

export { RpcReplyError, stubRpcEndpoint } from "./rpc-stub.js";
export type {
  RpcStub,
  RpcStubCall,
  RpcStubRoutes,
  StubRpcEndpointOptions,
} from "./rpc-stub.js";

export { buildRequest, TestResponse } from "./request.js";

export { spyAction, spyFilter, expectError } from "./spies.js";

export { deepEqual, partialMatch } from "./match.js";
