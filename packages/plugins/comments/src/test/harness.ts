import type { User } from "plumix/schema";
import type { createDispatcherHarness } from "plumix/test";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness as createHarness } from "plumix/test";

import type { CommentsConfig } from "../types.js";
import { comments as commentsTable } from "../db/schema.js";
import { comments } from "../index.js";
import { applyCommentsSchema } from "./db.js";

/** The origin `plumix/test` builds every request against. */
export const ORIGIN = "https://cms.example";

export type Harness = Awaited<ReturnType<typeof createDispatcherHarness>>;

/** An entry type to hang comments off, with nothing else to it. */
export const testBlog = definePlugin("test_blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      rewrite: { slug: "posts" },
    });
  },
});

export interface CommentsHarnessOptions {
  /** The client address, as a runtime adapter reports it to core. */
  readonly clientAddress?: string;
}

export async function harnessWith(
  config: CommentsConfig,
  options: CommentsHarnessOptions = {},
): Promise<Harness> {
  const harness = await createHarness({
    plugins: [testBlog, comments(config)],
    clientAddress: options.clientAddress,
  });
  await applyCommentsSchema(harness.db);
  return harness;
}

export async function seedPost(harness: Harness, overrides = {}) {
  const user = await harness.factory.user.create({});
  return harness.factory.entry.create({
    type: "post",
    title: "Post",
    authorId: user.id,
    status: "published",
    ...overrides,
  });
}

export async function rows(harness: Harness) {
  return harness.db.select().from(commentsTable);
}

/**
 * Exactly what a browser sends for `<form method="post" action="…">`: a
 * urlencoded body, an `Origin` and a `Referer`, and none of the
 * `X-Plumix-Request` header it has no way to set.
 *
 * `as` puts a session cookie on it, which is how the tests show that the
 * `formPost` exemption hands the handler a request with no session to
 * read even when the cookie is right there on the wire.
 */
export function formPost(
  harness: Harness,
  fields: Record<string, string>,
  options: {
    readonly headers?: Record<string, string>;
    readonly as?: User;
  } = {},
) {
  return harness.fetch("/_plumix/comments/submit", {
    method: "POST",
    withCsrfHeader: false,
    as: options.as ?? null,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: ORIGIN,
      referer: `${ORIGIN}/posts/post`,
      accept: "text/html,application/xhtml+xml",
      ...options.headers,
    },
    body: new URLSearchParams(fields).toString(),
  });
}
