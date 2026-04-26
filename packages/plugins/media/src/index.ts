import type { PluginDescriptor } from "@plumix/core";
import { definePlugin } from "@plumix/core";

import { DEFAULT_ACCEPTED_TYPES } from "./mime.js";
import { createMediaRouter } from "./rpc.js";

export { DEFAULT_ACCEPTED_TYPES };

/** Default max upload size — 25 MiB. */
export const DEFAULT_MAX_UPLOAD_SIZE = 25 * 1024 * 1024;

interface MediaPluginOptions {
  /**
   * MIME types accepted by `media.createUploadUrl`. The browser sends a
   * proposed `contentType`; anything outside the allowlist is rejected
   * before a presigned URL is minted. Defaults to {@link DEFAULT_ACCEPTED_TYPES}.
   */
  readonly acceptedTypes?: readonly string[];
  /**
   * Maximum upload size in bytes. Browsers report `size` in
   * `media.createUploadUrl`; uploads above this cap are rejected up front
   * and the cap is signed into the presigned URL's `Content-Length`.
   * Defaults to 25 MiB.
   */
  readonly maxUploadSize?: number;
}

/**
 * Lexical path the plumix vite plugin uses to locate this package's admin
 * chunk. Stays inside the consumer's project tree (`node_modules/...`) so
 * the build-time containment check passes; esbuild follows the symlink to
 * the workspace source under the hood. Override `adminEntry` in
 * `definePlugin` if your install layout differs (e.g. pnpm hoisting tweaks).
 */
const ADMIN_ENTRY_PATH =
  "node_modules/@plumix/plugin-media/dist/admin/index.js";

/**
 * Media plugin — registers the `media` entry type, the `media.*` RPC
 * router, and the admin Media Library page.
 *
 * Uploads use the two-phase signed-URL flow:
 *
 *   1. `media.createUploadUrl({ filename, contentType, size })` →
 *      creates a `draft` entry, returns a presigned PUT URL the browser
 *      uses to upload bytes directly to storage.
 *   2. `media.confirm({ id })` → flips the entry from `draft` to
 *      `published` once the browser-PUT succeeded.
 *
 * Bytes never traverse the worker. Requires a storage adapter whose
 * `presignPut` is implemented (e.g. `r2({ s3: { ... } })`).
 *
 * Pairs with `imageDelivery:` for on-the-fly resizing.
 *
 * @example
 * ```ts
 * import { media } from "@plumix/plugin-media";
 *
 * plumix({
 *   storage: r2({
 *     binding: "MEDIA",
 *     publicUrlBase: "https://media.example.com",
 *     s3: {
 *       bucket: "plumix-media",
 *       accountId: env.CF_ACCOUNT_ID,
 *       accessKeyId: env.R2_ACCESS_KEY_ID,
 *       secretAccessKey: env.R2_SECRET_ACCESS_KEY,
 *     },
 *   }),
 *   imageDelivery: images({ zone: "media.example.com" }),
 *   plugins: [media()],
 * });
 * ```
 */
export function media(
  options: MediaPluginOptions = {},
): PluginDescriptor<undefined> {
  const acceptedTypes = options.acceptedTypes ?? DEFAULT_ACCEPTED_TYPES;
  const maxUploadSize = options.maxUploadSize ?? DEFAULT_MAX_UPLOAD_SIZE;

  return definePlugin(
    "media",
    (ctx) => {
      ctx.registerEntryType("media", {
        label: "Media",
        labels: { singular: "Asset", plural: "Media" },
        description: "Uploaded files — images, video, documents",
        supports: ["title", "excerpt"],
        isPublic: false,
        excludeFromGenericRpc: false,
        hasArchive: false,
        menuIcon: "image",
      });

      ctx.registerRpcRouter(
        createMediaRouter({ acceptedTypes, maxUploadSize }),
      );

      ctx.registerAdminPage({
        path: "/media",
        title: "Media Library",
        capability: "entry:media:read",
        nav: {
          group: "management",
          label: "Media Library",
          order: 50,
        },
        component: {
          package: "@plumix/plugin-media",
          export: "MediaLibrary",
        },
      });
    },
    { adminEntry: ADMIN_ENTRY_PATH },
  );
}
