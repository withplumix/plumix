import type { Label } from "plumix/i18n";
import type { EntryTypeLabels, PluginDescriptor } from "plumix/plugin";
import {
  definePlugin,
  PLUGIN_I18N_SLOT,
  pluginAdminEntryPath,
} from "plumix/plugin";

import { MEDIA_FIELD_TYPES } from "./field-types.js";
import { mediaLookupAdapter } from "./lookup.js";
import { mediaGetTool, mediaListTool } from "./mcp-tools.js";
import { mediaBlocks } from "./media-blocks.js";
import { DEFAULT_ACCEPTED_TYPES } from "./mime.js";
import { MEDIA_READ_CAPABILITY, purgeVariants } from "./read-service.js";
import { createMediaRouter } from "./rpc.js";
import { handleMediaServe } from "./serve-route.js";
import { handleWorkerUpload } from "./upload-route.js";

export type { MediaFieldScope, MediaReference } from "./lookup.js";

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

const MEDIA_DESCRIPTION = {
  id: "plugin.media.media.description",
  message: "Uploaded files — images, video, documents",
};

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

interface MediaPluginOptions {
  readonly acceptedTypes?: readonly string[];
  // Bytes. Caps the declared `size`; the presigned PUT is signed for exactly
  // that `Content-Length`, so storage refuses any other body length.
  readonly maxUploadSize?: number;
}

// Lexical, inside the consumer's `node_modules`, so the build-time containment
// check passes; esbuild follows the symlink to the source.
const ADMIN_ENTRY_PATH = pluginAdminEntryPath("@plumix/plugin-media");

/**
 * Browsers upload straight to storage through a presigned URL when the storage
 * adapter implements `presignPut`, and through a worker route otherwise.
 */
export function media(options: MediaPluginOptions = {}): PluginDescriptor {
  const acceptedTypes = options.acceptedTypes ?? DEFAULT_ACCEPTED_TYPES;
  const maxUploadSize = options.maxUploadSize ?? DEFAULT_MAX_UPLOAD_SIZE;

  return definePlugin(
    "media",
    (ctx) => {
      // Media blocks (`media/image`, `media/file`) under the `media/`
      // namespace.
      ctx.registerBlocks(mediaBlocks);

      for (const fieldType of MEDIA_FIELD_TYPES) {
        ctx.registerFieldType(fieldType);
      }

      ctx.registerEntryType("media", {
        label: MEDIA_LABELS.plural,
        labels: MEDIA_LABELS,
        description: MEDIA_DESCRIPTION,
        supports: ["title", "excerpt"],
        // Also hides the generic entries list, sidebar item and dashboard
        // card: the plugin renders its own admin page.
        isPublic: false,
        hasArchive: false,
        menuIcon: "image",
        // An owner deletes their own upload on `delete`, which a contributor
        // holds here; someone else's still takes `edit_any` on top.
        capabilities: { delete: "contributor" },
      });

      ctx.registerRpcRouter(
        createMediaRouter({ acceptedTypes, maxUploadSize }),
      );

      ctx.addAction("entry:media:trashed", (entry, appCtx) =>
        purgeVariants(appCtx, entry),
      );
      ctx.addAction("entry:media:deleted", (entry, appCtx) =>
        purgeVariants(appCtx, entry),
      );

      // Media's own MCP read tools, contributed through the plugin seam —
      // they ship from the plugin that owns media, not core.
      ctx.registerMcpTool(mediaListTool);
      ctx.registerMcpTool(mediaGetTool);

      // Capability matches the media library page gate.
      ctx.registerLookupAdapter({
        kind: "media",
        adapter: mediaLookupAdapter,
        capability: MEDIA_READ_CAPABILITY,
      });

      // Upload fallback `media.createUploadUrl` hands out when the storage
      // adapter has no `presignPut` (an R2 binding without S3 credentials).
      ctx.registerRoute({
        method: "PUT",
        path: "/upload/*",
        auth: "authenticated",
        handler: handleWorkerUpload,
      });

      // Storage without a public URL base points here. Public so published
      // media can be embedded in pages.
      ctx.registerRoute({
        method: "GET",
        path: "/serve/*",
        auth: "public",
        handler: handleMediaServe,
      });

      ctx.registerAdminPage({
        path: "/media",
        title: MEDIA_LIBRARY_LABEL,
        capability: MEDIA_READ_CAPABILITY,
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
          keywords: [
            { id: "plugin.media.keyword.images", message: "images" },
            { id: "plugin.media.keyword.files", message: "files" },
            { id: "plugin.media.keyword.uploads", message: "uploads" },
            { id: "plugin.media.keyword.photos", message: "photos" },
            { id: "plugin.media.keyword.assets", message: "assets" },
          ],
        },
        component: "MediaLibrary",
      });
    },
    {
      adminEntry: ADMIN_ENTRY_PATH,
      i18n: PLUGIN_I18N_SLOT,
    },
  );
}
