import type { AnyPluginDescriptor } from "plumix";
import type { User } from "plumix/schema";
import type {
  createDispatcherHarness,
  CreateDispatcherHarnessOptions,
} from "plumix/test";
import { challenge, definePolicy, grant } from "plumix/auth";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness as createHarness } from "plumix/test";

import type { CommentsConfig } from "../types.js";
import { comments as commentsTable } from "../db/schema.js";
import { comments } from "../index.js";
import { applyCommentsSchema } from "./db.js";

/** The origin `plumix/test` builds every request against. */
export const ORIGIN = "https://cms.example";

export type Harness = Awaited<ReturnType<typeof createDispatcherHarness>>;

/**
 * A members-only gate that answers terminally. `authenticatedPolicy` would
 * redirect to sign-in, which no harness here routes a page for, and where the
 * gate sends a reader is not what the comment surfaces are tested on.
 */
// The challenge is hard, not soft, and the tests depend on it: a soft
// challenge still renders (a theme serves a teaser at the same URL), so
// `entryAllowsAnonymousAccess` would answer yes and gate nothing.
const membersOnlyPolicy = definePolicy({
  segments: ["members"],
  resolve: (ctx) => (ctx.user ? grant("members") : challenge("subscribe")),
});

/** {@link testBlog} with its entry type gated to members. */
export const gatedBlog = definePlugin("gated_blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      rewrite: { slug: "posts" },
      access: { default: membersOnlyPolicy },
    });
  },
});

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

export async function harnessWith(
  config: CommentsConfig,
  {
    blog = testBlog,
    ...options
  }: Omit<CreateDispatcherHarnessOptions, "plugins"> & {
    readonly blog?: AnyPluginDescriptor;
  } = {},
): Promise<Harness> {
  const harness = await createHarness({
    ...options,
    plugins: [blog, comments(config)],
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
