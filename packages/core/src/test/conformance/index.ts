// Its own subpath rather than part of `plumix/test` because these modules
// import vitest, which a Playwright-only consumer must not have to install.
export { describeKvContract } from "./kv.js";
export type { KvContractOptions } from "./kv.js";

export { describeObjectStorageContract } from "./object-storage.js";
export type { ObjectStorageContractOptions } from "./object-storage.js";

// The bucket an S3-backed slot runs the object-storage contract against.
export { fakeS3 } from "../../storage/s3/fake-s3.js";
export type { FakeS3, FakeS3Options } from "../../storage/s3/fake-s3.js";

export { describeCdnContract } from "./cdn.js";
export type { CdnContractOptions } from "./cdn.js";

export { describeAssetsContract } from "./assets.js";
export type { AssetsContractOptions, AssetsNotFound } from "./assets.js";

export { describeDatabaseContract } from "./database.js";
export type {
  DatabaseContractBinding,
  DatabaseContractOptions,
} from "./database.js";
