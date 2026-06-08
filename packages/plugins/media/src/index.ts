import type { Label } from "plumix/i18n";
import type { EntryTypeLabels, PluginDescriptor } from "plumix/plugin";
import { definePlugin } from "plumix/plugin";

import { audioBlock } from "./blocks/audio/index.js";
import { embedBlock } from "./blocks/embed/index.js";
import { fileBlock } from "./blocks/file/index.js";
import { galleryBlock } from "./blocks/gallery/index.js";
import { imageBlock } from "./blocks/image/index.js";
import { videoBlock } from "./blocks/video/index.js";
import { mediaLookupAdapter } from "./lookup.js";
import { DEFAULT_ACCEPTED_TYPES } from "./mime.js";
import { createMediaRouter } from "./rpc.js";
import { handleMediaServe } from "./serve-route.js";
import { handleWorkerUpload } from "./upload-route.js";

export type { MediaFieldScope } from "./lookup.js";

export { DEFAULT_ACCEPTED_TYPES };

/** Default max upload size — 25 MiB. */
export const DEFAULT_MAX_UPLOAD_SIZE = 25 * 1024 * 1024;

// Per-entity label table; `satisfies EntryTypeLabels` catches typo-
// renames at compile time. See `plugin-pages/src/index.ts` for the
// "no Babel macro server-side" rationale on the literal `{id,message}`
// shape.
const MEDIA_LABELS = {
  singular: { id: "plugin.media.media.singular", message: "Asset" },
  plural: { id: "plugin.media.media.plural", message: "Media" },
  addNew: { id: "plugin.media.media.addNew", message: "Add New" },
  addNewItem: {
    id: "plugin.media.media.addNewItem",
    message: "Upload Media",
  },
  editItem: {
    id: "plugin.media.media.editItem",
    message: "Edit Media",
  },
  newItem: {
    id: "plugin.media.media.newItem",
    message: "New Media",
  },
  viewItem: {
    id: "plugin.media.media.viewItem",
    message: "View Media",
  },
  searchItems: {
    id: "plugin.media.media.searchItems",
    message: "Search media…",
  },
  notFound: {
    id: "plugin.media.media.notFound",
    message: "No media yet",
  },
  notFoundInTrash: {
    id: "plugin.media.media.notFoundInTrash",
    message: "Trash is empty",
  },
  allItems: {
    id: "plugin.media.media.allItems",
    message: "All Media",
  },
  untitledItem: {
    id: "plugin.media.media.untitledItem",
    message: "Untitled Media",
  },
  moveToTrash: {
    id: "plugin.media.media.moveToTrash",
    message: "Move media to trash?",
  },
} satisfies EntryTypeLabels;

// Admin-page chrome (separate from per-type labels because the
// "Media Library" page heading isn't an entry-type label).
const MEDIA_LIBRARY_LABEL: Label = {
  id: "plugin.media.adminPage.title",
  message: "Media Library",
};
const LIBRARY_GROUP_LABEL: Label = {
  id: "core.adminNav.library",
  message: "Library",
};

// Re-export the canonical list from `media-blocks.ts` (server-clean).
export { mediaBlocks } from "./media-blocks.js";

interface MediaPluginOptions {
  /**
   * MIME types accepted by `media.createUploadUrl`. The browser sends a
   * proposed `contentType`; anything outside the allowlist is rejected
   * before a presigned URL is minted. Defaults to {@link DEFAULT_ACCEPTED_TYPES}.
   */
  readonly acceptedTypes?: readonly string[];
  /**
   * Maximum upload size in bytes. The browser-declared `size` in
   * `media.createUploadUrl` is rejected up front if it exceeds this
   * cap, the value is signed into presigned PUTs as `Content-Length`,
   * and the worker-routed upload counts actual bytes streamed and
   * aborts past the cap. Defaults to 25 MiB.
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
      // Media blocks contributed under the `media/` namespace. Order is
      // just for readability; the registry is keyed by name.
      ctx.registerBlock(imageBlock);
      ctx.registerBlock(galleryBlock);
      ctx.registerBlock(videoBlock);
      ctx.registerBlock(audioBlock);
      ctx.registerBlock(fileBlock);
      ctx.registerBlock(embedBlock);

      ctx.registerEntryType("media", {
        label: MEDIA_LABELS.plural,
        labels: MEDIA_LABELS,
        description: "Uploaded files — images, video, documents",
        supports: ["title", "excerpt"],
        // `isPublic: false` cascades to `showUI: false` and
        // `showInSidebar: false`. Both are load-bearing here:
        // the plugin renders its own admin page (registered below)
        // — we don't want the generic entries list, sidebar item,
        // or dashboard quick-card auto-registered too.
        isPublic: false,
        excludeFromGenericRpc: false,
        hasArchive: false,
        menuIcon: "image",
      });

      ctx.registerRpcRouter(
        createMediaRouter({ acceptedTypes, maxUploadSize }),
      );

      // Reference-field surface: any `media({ ... })` field calls
      // through `lookup.list({ kind: "media", ids })` for write
      // validation + read-time orphan filter, and through the same
      // RPC for picker label resolution. Capability matches the
      // existing media library page gate.
      ctx.registerLookupAdapter({
        kind: "media",
        adapter: mediaLookupAdapter,
        capability: "entry:media:read",
      });

      // Worker-routed upload fallback. `media.createUploadUrl` returns
      // this URL when `storage.presignPut` isn't configured (e.g. the
      // R2 binding is attached but no S3 credentials are wired up). The
      // browser PUTs bytes here, the dispatcher authenticates the
      // session, and the handler streams them through to storage.
      ctx.registerRoute({
        method: "PUT",
        path: "/upload/*",
        auth: "authenticated",
        handler: handleWorkerUpload,
      });

      // Worker-proxied media serve. When the storage adapter has no
      // public URL base (private bucket without a custom domain),
      // `r2.url()` returns a relative URL pointing here. Public so
      // published media can be embedded in pages/posts.
      ctx.registerRoute({
        method: "GET",
        path: "/serve/*",
        auth: "public",
        handler: handleMediaServe,
      });

      ctx.registerAdminPage({
        path: "/media",
        title: MEDIA_LIBRARY_LABEL,
        capability: "entry:media:read",
        nav: {
          // Own group between Entries (priority 100) and Taxonomies
          // (priority 200). Media isn't a content surface like Posts/
          // Pages — putting it under "Entries" reads as nesting, which
          // doesn't match the WordPress mental model.
          group: {
            id: "library",
            label: LIBRARY_GROUP_LABEL,
            priority: 150,
          },
          label: MEDIA_LIBRARY_LABEL,
          order: 50,
        },
        component: "MediaLibrary",
      });
    },
    {
      adminEntry: ADMIN_ENTRY_PATH,
      i18n: {
        sourceLocale: "en",
        locales: ["en"],
        catalogPath: "./locales",
      },
    },
  );
}
