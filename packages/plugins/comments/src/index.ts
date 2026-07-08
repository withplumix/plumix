import type { Label } from "plumix/i18n";
import { definePlugin, tryGetContext } from "plumix/plugin";

import type { CommentsConfig } from "./types.js";
import { resolveConfig } from "./config.js";
import * as schema from "./db/schema.js";
import { COMMENT_MODERATE_CAPABILITY, createCommentsRouter } from "./rpc.js";
import { createListHandler } from "./server/list.js";
import { notifyModeratorOfPending } from "./server/notify.js";
import {
  commentCollectionParamsSchema,
  commentsEnvelopeSchema,
  createCommentsRestHandler,
} from "./server/rest.js";
import { createSubmitHandler } from "./server/submit.js";
import { createCommentsThreadLoader } from "./server/template-dep.js";

export type { CommentsConfig, CommentStatus, ModerationMode } from "./types.js";
export { COMMENT_STATUSES } from "./types.js";

const ADMIN_ENTRY_PATH =
  "node_modules/@plumix/plugin-comments/dist/admin/index.js";

// Plain descriptor literal — plugin source runs server-side without the
// Babel macro pipeline, so the manifest payload is authored by hand.
const COMMENT_LABELS = {
  comments: { id: "plugin.comments.adminPage.title", message: "Comments" },
} satisfies Record<string, Label>;

/**
 * `@plumix/plugin-comments` — threaded, moderated discussion on entries.
 *
 * Registers a `comments` template dep so a theme can render the approved
 * thread for the entry it's displaying:
 *
 *     defineTemplate({
 *       single: {
 *         comments: ["current"],
 *         render: ({ comments }) => <Thread data={comments?.current} />,
 *       },
 *     })
 *
 * and a public `POST /_plumix/comments/submit` route that runs a new
 * comment through honeypot + rate-limit + the trust policy and the
 * `comment:moderate` filter chain before persisting it.
 *
 * Commenting is enabled for an entry type when the type is listed in
 * `comments({ entryTypes })` or self-declares `supports: ['comments']`.
 * Threading depth and the admin moderation queue arrive in later slices.
 */
export function comments(options: CommentsConfig = {}) {
  const config = resolveConfig(options);
  return definePlugin("comments", {
    schema,
    // Module specifier `plumix migrate generate` uses to fold this
    // plugin's table into the host's drizzle-kit codegen.
    schemaModule: "@plumix/plugin-comments/schema",
    adminEntry: ADMIN_ENTRY_PATH,
    i18n: {
      sourceLocale: "en",
      locales: ["en", "uk", "ar", "de", "zh-CN"],
      catalogPath: "./locales",
    },
    setup: (ctx) => {
      ctx.registerCapability(COMMENT_MODERATE_CAPABILITY, "editor");
      ctx.registerRpcRouter(createCommentsRouter());
      ctx.registerAdminPage({
        path: "/comments",
        title: COMMENT_LABELS.comments,
        capability: COMMENT_MODERATE_CAPABILITY,
        nav: {
          // Bare-string ref attaches to core's reserved "content" group
          // (rendered as the already-translated "Entries" group); core
          // ignores inline label/priority for its own group ids.
          group: "content",
          label: COMMENT_LABELS.comments,
          order: 30,
          keywords: [
            { id: "plugin.comments.keyword.moderation", message: "moderation" },
            { id: "plugin.comments.keyword.discussion", message: "discussion" },
            { id: "plugin.comments.keyword.replies", message: "replies" },
            { id: "plugin.comments.keyword.spam", message: "spam" },
          ],
        },
        component: "CommentsShell",
      });
      ctx.registerTemplateDep("comments", {
        load: createCommentsThreadLoader(config),
      });
      ctx.registerRoute({
        method: "POST",
        path: "/submit",
        auth: "public",
        handler: createSubmitHandler(config),
      });
      ctx.registerRoute({
        method: "GET",
        path: "/list",
        auth: "public",
        handler: createListHandler(config),
      });
      ctx.registerRestResource({
        path: "/{type}/{id}/comments",
        auth: "public",
        input: commentCollectionParamsSchema,
        output: commentsEnvelopeSchema,
        handler: createCommentsRestHandler(config),
      });

      if (config.notifyEmail) {
        const recipient = config.notifyEmail;
        // The action carries only the comment, so the mailer-bearing
        // AppContext comes from the request store; skip if it's absent
        // (the action fired outside a request).
        ctx.addAction("comment:created", async (comment) => {
          const appCtx = tryGetContext();
          if (appCtx)
            await notifyModeratorOfPending(appCtx, comment, recipient);
        });
      }
    },
  });
}
