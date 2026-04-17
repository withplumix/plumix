import type { AppContext } from "../../../context/app.js";
import type { NewPost, Post, PostStatus } from "../../../db/schema/posts.js";

export async function applyPostBeforeSave(
  ctx: AppContext,
  type: string,
  post: NewPost,
): Promise<NewPost> {
  const afterSpecific =
    type === "post"
      ? post
      : await ctx.hooks.applyFilter(`${type}:before_save`, post);
  return ctx.hooks.applyFilter("post:before_save", afterSpecific);
}

export async function firePostTransition(
  ctx: AppContext,
  post: Post,
  oldStatus: PostStatus,
): Promise<void> {
  if (post.status === oldStatus) return;
  if (post.type !== "post") {
    await ctx.hooks.doAction(`${post.type}:transition`, post, oldStatus);
  }
  await ctx.hooks.doAction("post:transition", post, oldStatus);
}

export async function firePostPublished(
  ctx: AppContext,
  post: Post,
): Promise<void> {
  if (post.type !== "post") {
    await ctx.hooks.doAction(`${post.type}:published`, post);
  }
  await ctx.hooks.doAction("post:published", post);
}

export async function firePostUpdated(
  ctx: AppContext,
  post: Post,
  previous: Post,
): Promise<void> {
  if (post.type !== "post") {
    await ctx.hooks.doAction(`${post.type}:updated`, post, previous);
  }
  await ctx.hooks.doAction("post:updated", post, previous);
}

export async function firePostTrashed(
  ctx: AppContext,
  post: Post,
): Promise<void> {
  if (post.type !== "post") {
    await ctx.hooks.doAction(`${post.type}:trashed`, post);
  }
  await ctx.hooks.doAction("post:trashed", post);
}

export function postCapability(type: string, action: string): string {
  return `${type}:${action}`;
}
