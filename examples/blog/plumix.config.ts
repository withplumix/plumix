import { blog } from "@plumix/plugin-blog";
import { media } from "@plumix/plugin-media";
import { pages } from "@plumix/plugin-pages";
import {
  cloudflare,
  cloudflareDeployOrigin,
  d1,
  images,
  r2,
} from "@plumix/runtime-cloudflare";
import { auth, plumix } from "plumix";

// Derives `rpId` + `origin` from the Workers Builds env (`WORKERS_CI`,
// `WORKERS_CI_BRANCH`): production deploys → `<worker>.<account>.workers.dev`,
// preview deploys → `<branch>-<worker>.<account>.workers.dev`,
// local `pnpm dev` → `http://localhost:8787`. Swap to a hardcoded
// `{ rpId, origin }` once you wire a custom domain.
const { rpId, origin } = cloudflareDeployOrigin({
  workerName: "plumix-blog",
  accountSubdomain: "enasyrov",
});

// Media R2 + image-delivery wiring is opt-in via env. With S3
// credentials (CF_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY +
// MEDIA_BUCKET), uploads bypass the worker via presigned PUTs straight
// to R2. Without them, `media.createUploadUrl` returns a worker-routed
// URL and bytes flow through `env.MEDIA.put` via the binding — slower
// at scale but works the moment the bucket binding is attached. Set
// MEDIA_PUBLIC_URL_BASE to a CF zone with Image Transformations enabled
// for thumbnails on the fly.
const s3 = resolveR2S3Credentials();

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
      rpName: "Plumix — Blog",
      rpId,
      origin,
    },
  }),
  plugins: [blog, pages, media()],
});

function resolveR2S3Credentials():
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
  if (
    accountId !== undefined &&
    accessKeyId !== undefined &&
    secretAccessKey !== undefined &&
    bucket !== undefined
  ) {
    return { accountId, accessKeyId, secretAccessKey, bucket };
  }
  if (
    accountId === undefined &&
    accessKeyId === undefined &&
    secretAccessKey === undefined &&
    bucket === undefined
  ) {
    return undefined;
  }
  throw new Error(
    "blog example: partial R2 S3 credentials. Set all of CF_ACCOUNT_ID, " +
      "R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, MEDIA_BUCKET (or none).",
  );
}
