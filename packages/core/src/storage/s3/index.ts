// Own subpath so the signer stays out of bundles that never import it — the
// route `db/libsql` took for its driver.

export { S3Error, SigV4Error } from "./errors.js";
export { s3 } from "./s3.js";
export type { S3Config, S3Credentials, S3ObjectStorage } from "./s3.js";
export {
  DEFAULT_PRESIGN_TTL_SECONDS,
  EMPTY_PAYLOAD_HASH,
  presignPutUrl,
  sha256Hex,
  signRequest,
} from "./sigv4.js";
export type {
  PresignedPut,
  PresignPutInput,
  SigV4Credentials,
  SignRequestInput,
} from "./sigv4.js";
