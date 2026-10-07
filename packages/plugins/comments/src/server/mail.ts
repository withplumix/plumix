import type { MailRenderContext } from "plumix/plugin";
import type { Entry } from "plumix/schema";
import { defineMail } from "plumix/plugin";
import { escapeHtml } from "plumix/support";

import type { Comment } from "../db/schema.js";

/** Props of `commentAwaitingModeration`, mailed when a comment is held. */
export interface CommentAwaitingModerationProps {
  readonly comment: Comment;
  /** The entry the comment was left on. */
  readonly entry: Pick<Entry, "id" | "type" | "title" | "slug">;
  /** The admin's moderation queue. */
  readonly moderationUrl: string;
}

declare module "plumix" {
  interface MailRegistry {
    commentAwaitingModeration: CommentAwaitingModerationProps;
  }
}

// Plain descriptor literals, hand-authored into `locales/*.po` like every
// other string this plugin renders server-side.
const M = {
  subject: {
    id: "plugin.comments.mail.pending.subject",
    message: "A comment is awaiting moderation",
  },
  intro: {
    id: "plugin.comments.mail.pending.intro",
    message:
      "{authorName} left a comment on “{entryTitle}” that's held for review:",
  },
  review: {
    id: "plugin.comments.mail.pending.review",
    message: "Review it in the moderation queue:",
  },
} as const;

function intro(
  props: CommentAwaitingModerationProps,
  ctx: MailRenderContext,
): string {
  return ctx.t(M.intro, {
    authorName: props.comment.authorName,
    entryTitle: props.entry.title,
  });
}

export const commentAwaitingModerationMail =
  defineMail<CommentAwaitingModerationProps>("commentAwaitingModeration", {
    subject: (_props, ctx) => ctx.t(M.subject),
    text: (props, ctx) =>
      [
        intro(props, ctx),
        props.comment.bodyMd,
        ctx.t(M.review),
        props.moderationUrl,
      ].join("\n\n"),
    // Everything a commenter wrote is escaped: the body is shown as the
    // Markdown source it was submitted as, never rendered.
    html: (props, ctx) => {
      const href = escapeHtml(props.moderationUrl).replace(/"/g, "&quot;");
      return [
        `<p>${escapeHtml(intro(props, ctx))}</p>`,
        `<blockquote>${escapeHtml(props.comment.bodyMd).replace(/\n/g, "<br>")}</blockquote>`,
        `<p>${escapeHtml(ctx.t(M.review))}</p>`,
        `<p><a href="${href}">${escapeHtml(props.moderationUrl)}</a></p>`,
      ].join("\n");
    },
    preview: {
      comment: {
        id: 1,
        entryId: 1,
        parentId: null,
        status: "pending",
        authorUserId: null,
        authorName: "Ada",
        authorEmail: "ada@example.com",
        bodyMd: "Lovely post. Could you say more about the second point?",
        ipHash: null,
        userAgent: null,
        meta: {},
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
      entry: { id: 1, type: "post", title: "Hello world", slug: "hello-world" },
      moderationUrl: "https://example.com/_plumix/admin/pages/comments",
    },
  });
