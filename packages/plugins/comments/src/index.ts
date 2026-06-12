import { definePlugin } from "plumix/plugin";

import type { CommentsConfig } from "./types.js";
import { resolveConfig } from "./config.js";
import * as schema from "./db/schema.js";
import { createSubmitHandler } from "./server/submit.js";
import { createCommentsThreadLoader } from "./server/template-dep.js";

export type { CommentsConfig, CommentStatus, ModerationMode } from "./types.js";
export { COMMENT_STATUSES } from "./types.js";

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
    setup: (ctx) => {
      ctx.registerTemplateDep("comments", {
        load: createCommentsThreadLoader(config),
      });
      ctx.registerRoute({
        method: "POST",
        path: "/submit",
        auth: "public",
        handler: createSubmitHandler(config),
      });
    },
  });
}
