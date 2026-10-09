import type { Label } from "plumix/i18n";
import type { AppContext } from "plumix/plugin";
import {
  definePlugin,
  PLUGIN_I18N_SLOT,
  pluginAdminEntryPath,
  recordWrite,
} from "plumix/plugin";

import type { ResolvedCommentsConfig } from "./config.js";
import type { Comment } from "./db/schema.js";
import type { CommentsConfig } from "./types.js";
import { resolveConfig } from "./config.js";
import { LIST_ROUTE_PATH, SUBMIT_ROUTE_PATH } from "./contract.js";
import * as schema from "./db/schema.js";
import { COMMENT_MODERATE_CAPABILITY, createCommentsRouter } from "./rpc.js";
import { createListHandler } from "./server/list.js";
import { commentAwaitingModerationMail } from "./server/mail.js";
import { notifyModeratorOfPending } from "./server/notify.js";
import {
  COMMENTS_REST_PATH,
  commentsEnvelopeSchema,
  createCommentsRestHandler,
} from "./server/rest.js";
import { createSubmitHandler } from "./server/submit.js";
import {
  createCommentsThreadLoader,
  threadRead,
} from "./server/template-dep.js";

export type { CommentsConfig, CommentStatus, ModerationMode } from "./types.js";
export { COMMENT_STATUSES } from "./types.js";

declare module "plumix" {
  interface AppContextExtensions {
    /**
     * What this app's comment form needs — on the request context because
     * `PlumixCommentForm` renders in a theme template, which can reach
     * nothing else that belongs to one app.
     */
    readonly comments?: Pick<ResolvedCommentsConfig, "requireEmail">;
  }
}

const ADMIN_ENTRY_PATH = pluginAdminEntryPath("@plumix/plugin-comments");

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
    // Module specifier `plumix migrate` resolves to find this package's
    // migration history.
    schemaModule: "@plumix/plugin-comments/schema",
    adminEntry: ADMIN_ENTRY_PATH,
    i18n: PLUGIN_I18N_SLOT,
    mails: [commentAwaitingModerationMail],
    provides: (ctx) => {
      ctx.extendAppContext("comments", { requireEmail: config.requireEmail });
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
        keyedBy: "slug",
        load: createCommentsThreadLoader(config),
      });
      ctx.registerRoute({
        method: "POST",
        path: SUBMIT_ROUTE_PATH,
        auth: "public",
        // A browser cannot set the `X-Plumix-Request` header on a plain
        // form submit, so without this there is no commenting without
        // JavaScript at all. The Origin check is then the whole gate, and
        // the handler reads no session — see `createSubmitHandler` for
        // what that costs a signed-in author.
        formPost: true,
        handler: createSubmitHandler(config),
      });
      ctx.registerRoute({
        method: "GET",
        path: LIST_ROUTE_PATH,
        auth: "public",
        handler: createListHandler(config),
      });
      ctx.registerRestResource({
        path: COMMENTS_REST_PATH,
        auth: "public",
        output: commentsEnvelopeSchema,
        handler: createCommentsRestHandler(config),
      });

      // A page that rendered the thread read it (see the `comments` template
      // dep). The payload carries no previous status, so every transition
      // purges, even one that changed nothing visitors see.
      const purgeEntryPage = (comment: Comment, appCtx: AppContext) => {
        recordWrite(appCtx, [threadRead(comment.entryId)]);
      };
      ctx.addAction("comment:created", (comment, appCtx) => {
        // A held or spam comment changes nothing a visitor sees.
        if (comment.status === "approved") purgeEntryPage(comment, appCtx);
      });
      ctx.addAction("comment:approved", purgeEntryPage);
      ctx.addAction("comment:spam", purgeEntryPage);
      ctx.addAction("comment:trashed", purgeEntryPage);
      ctx.addAction("comment:deleted", purgeEntryPage);

      if (config.notifyEmail) {
        const recipient = config.notifyEmail;
        ctx.addAction("comment:created", (comment, appCtx) =>
          notifyModeratorOfPending(appCtx, comment, recipient),
        );
      }
    },
  });
}
