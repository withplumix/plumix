// Own subpath so the SigV4 signer stays out of bundles that don't import it.
// The signer's primitives are published with the slot: `signRequest` takes the
// payload hash its caller computes.

export type * from "@plumix/core/storage/s3";
export {
  DEFAULT_PRESIGN_TTL_SECONDS,
  EMPTY_PAYLOAD_HASH,
  presignPutUrl,
  s3,
  S3Error,
  sha256Hex,
  signRequest,
  SigV4Error,
} from "@plumix/core/storage/s3";
