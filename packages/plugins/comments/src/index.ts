import { definePlugin } from "plumix/plugin";

import type { CommentsConfig } from "./types.js";
import * as schema from "./db/schema.js";
import { createCommentsThreadLoader } from "./server/template-dep.js";

export type { CommentsConfig, CommentStatus } from "./types.js";
export { COMMENT_STATUSES } from "./types.js";

/**
 * `@plumix/plugin-comments` — threaded, moderated discussion on entries.
 *
 * The read path (this slice) registers a `comments` template dep so a
 * theme can render the approved thread for the entry it's displaying:
 *
 *     defineTemplate({
 *       single: {
 *         comments: ["current"],
 *         render: ({ comments }) => <Thread data={comments?.current} />,
 *       },
 *     })
 *
 * Commenting is enabled for an entry type when the type is listed in
 * `comments({ entryTypes })` or self-declares `supports: ['comments']`.
 * Submission, moderation, threading, and the admin queue arrive in
 * later slices; the `comments` table ships now so migrations include it.
 */
export function comments(options: CommentsConfig = {}) {
  return definePlugin("comments", {
    schema,
    // Module specifier `plumix migrate generate` uses to fold this
    // plugin's table into the host's drizzle-kit codegen.
    schemaModule: "@plumix/plugin-comments/schema",
    setup: (ctx) => {
      ctx.registerTemplateDep("comments", {
        load: createCommentsThreadLoader(options),
      });
    },
  });
}
