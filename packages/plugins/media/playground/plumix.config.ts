import { auth, plumix } from "plumix";

import { media } from "@plumix/plugin-media";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
  images,
  r2,
} from "@plumix/runtime-cloudflare";

// Plumix consumer that wires only the media plugin — the smallest config
// you can run to dogfood `@plumix/plugin-media` without bringing the rest
// of the plumix surface (blog, pages, etc.) along. Run `pnpm dev` from
// this directory to launch a local worker (D1 + R2 simulated by miniflare),
// then visit http://localhost:8787/_plumix/admin to register the first
// admin via passkey and try the Media Library.
//
// R2 presigned uploads require S3 API tokens — set CF_ACCOUNT_ID,
// R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and MEDIA_BUCKET as a group
// (all four or none). With them omitted, the binding-only path works
// for server-side reads / writes / lists but the client-side
// `media.createUploadUrl` returns a `presign_not_supported` CONFLICT.

const { rpId, origin } = cloudflareDeployOrigin({
  workerName: "plumix-media-playground",
  accountSubdomain: "local",
});

const s3 = resolveS3Credentials();

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  storage: r2({
    binding: "MEDIA",
    publicUrlBase: process.env.MEDIA_PUBLIC_URL_BASE,
    s3,
  }),
  imageDelivery: process.env.MEDIA_PUBLIC_URL_BASE
    ? images({ zone: process.env.MEDIA_PUBLIC_URL_BASE })
    : undefined,
  auth: auth({
    passkey: {
      rpName: "Plumix — Media playground",
      rpId,
      origin,
    },
  }),
  plugins: [media()],
});

function resolveS3Credentials():
  | {
      readonly bucket: string;
      readonly accountId: string;
      readonly accessKeyId: string;
      readonly secretAccessKey: string;
    }
  | undefined {
  const accountId = process.env.CF_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.MEDIA_BUCKET;
  // All four come together — partial config silently builds a broken
  // endpoint (e.g. `https://.r2.cloudflarestorage.com`) that fails at
  // request time with a misleading DNS error.
  const present = [accountId, accessKeyId, secretAccessKey, bucket].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  if (present.length === 0) return undefined;
  if (present.length !== 4) {
    throw new Error(
      "media playground: partial S3 credentials. Set all of " +
        "CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, MEDIA_BUCKET " +
        "(or none).",
    );
  }
  return {
    bucket: bucket as string,
    accountId: accountId as string,
    accessKeyId: accessKeyId as string,
    secretAccessKey: secretAccessKey as string,
  };
}
