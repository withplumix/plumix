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
 * Not `authenticatedPolicy`: no harness routes its sign-in redirect. A hard
 * challenge, because a soft one still renders, so anonymous access would be
 * allowed.
 */
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
  }: CreateDispatcherHarnessOptions & {
    readonly blog?: AnyPluginDescriptor;
  } = {},
): Promise<Harness> {
  const harness = await createHarness({
    ...options,
    config: { ...options.config, plugins: [blog, comments(config)] },
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

/**
 * A published revision row of `live` — status copied from the live entry, as
 * the editor's snapshot writes it.
 */
export async function seedRevision(
  harness: Harness,
  live: { readonly id: number; readonly authorId: number },
) {
  return harness.factory.entry.create({
    type: "revision",
    title: "Post",
    slug: `revision:${String(live.id)}:abcdefghijklmnopqrstu`,
    authorId: live.authorId,
    status: "published",
  });
}

/**
 * Commenting on for the revision type as well, so a revision row can only be
 * refused by the entry load, never by the type's enablement.
 */
export const REVISION_TYPES_ENABLED = ["post", "revision"];

export async function rows(harness: Harness) {
  return harness.db.select().from(commentsTable);
}

/**
 * What a browser sends for `<form method="post">`: no `X-Plumix-Request`
 * header, which it cannot set. `as` adds a session cookie the exemption must
 * ignore.
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
