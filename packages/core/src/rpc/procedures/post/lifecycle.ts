import type {
  AppContext,
  AuthenticatedAppContext,
} from "../../../context/app.js";
import type { NewPost, Post, PostStatus } from "../../../db/schema/posts.js";
import { eq } from "../../../db/index.js";
import { posts } from "../../../db/schema/posts.js";

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

// Mirrors the readability rules in `post.get`: any type-level `read` cap,
// and for non-published posts also requires `edit_any` or (author +
// `edit_own`). Kept local because this is the only call site — `post.get`
// inlines its own variant that also issues an errors.NOT_FOUND directly.
function canReadPost(ctx: AuthenticatedAppContext, post: Post): boolean {
  if (!ctx.auth.can(postCapability(post.type, "read"))) return false;
  if (post.status === "published") return true;
  if (ctx.auth.can(postCapability(post.type, "edit_any"))) return true;
  return (
    post.authorId === ctx.user.id &&
    ctx.auth.can(postCapability(post.type, "edit_own"))
  );
}

/**
 * Load the parent referenced by a user-supplied parentId and verify it
 * (a) exists, (b) shares the child's post type, and (c) is visible to the
 * caller per the same rules as `post.get`. Returns null when any check
 * fails — deliberately undistinguished so a caller can't probe for post
 * existence by reparenting. Callers should translate null into a 404.
 */
export async function loadReadableParent(
  ctx: AuthenticatedAppContext,
  childType: string,
  parentId: number,
): Promise<Post | null> {
  const parent = await ctx.db.query.posts.findFirst({
    where: eq(posts.id, parentId),
  });
  if (!parent) return null;
  if (parent.type !== childType) return null;
  if (!canReadPost(ctx, parent)) return null;
  return parent;
}

/**
 * Walk the parent chain upward from `candidateParentId` and decide whether
 * pointing `postId` at it would create a cycle — i.e. whether postId already
 * appears in the chain above candidateParentId. Returns true on any cycle
 * (including a pre-existing one walked into on the way up) or when the chain
 * exceeds a sanity limit; callers should treat true as "reject".
 *
 * Necessary because update.ts alone can't catch cycles of depth > 1
 * (A→B→A) from a self-id check; admin UI tree views will infinite-loop on
 * any such cycle left in the DB.
 */
export async function wouldCreateParentCycle(
  ctx: AuthenticatedAppContext,
  postId: number,
  candidateParentId: number,
): Promise<boolean> {
  const MAX_DEPTH = 64;
  const visited = new Set<number>();
  let cursor: number | null = candidateParentId;
  while (cursor !== null) {
    if (cursor === postId) return true;
    if (visited.has(cursor)) return true;
    if (visited.size >= MAX_DEPTH) return true;
    visited.add(cursor);
    const next: Post | undefined = await ctx.db.query.posts.findFirst({
      where: eq(posts.id, cursor),
    });
    cursor = next?.parentId ?? null;
  }
  return false;
}
