// Slot conformance suites — one parameterised `describe` per slot port. An
// adapter proves its kv, storage, cache or assets implementation satisfies the
// contract core relies on by calling these with a factory of its own.
//
// Its own subpath rather than part of `plumix/test`, because these modules
// import vitest: a Playwright-only consumer of the test surface must not have
// to install it.
export { describeKvContract } from "./kv.js";
export type { KvContractOptions } from "./kv.js";

export { describeObjectStorageContract } from "./object-storage.js";
export type { ObjectStorageContractOptions } from "./object-storage.js";

export { describeCacheContract } from "./cache.js";
export type { CacheContractOptions } from "./cache.js";

export { describeAssetsContract } from "./assets.js";
export type { AssetsContractOptions, AssetsNotFound } from "./assets.js";
