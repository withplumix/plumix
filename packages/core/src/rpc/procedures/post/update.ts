import type { NewPost } from "../../../db/schema/posts.js";
import { and, eq, isUniqueConstraintError, ne } from "../../../db/index.js";
import { posts } from "../../../db/schema/posts.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { stripUndefined } from "./helpers.js";
import {
  applyPostBeforeSave,
  firePostPublished,
  firePostTransition,
  firePostUpdated,
  postCapability,
} from "./lifecycle.js";
import { postUpdateInputSchema } from "./schemas.js";

export const update = base
  .use(authenticated)
  .input(postUpdateInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:post.update:input",
      input,
    );

    const existing = await context.db.query.posts.findFirst({
      where: eq(posts.id, filtered.id),
    });
    if (!existing) {
      throw errors.NOT_FOUND({ data: { kind: "post", id: filtered.id } });
    }

    const isAuthor = existing.authorId === context.user.id;
    const editOwnCapability = postCapability(existing.type, "edit_own");
    const editAnyCapability = postCapability(existing.type, "edit_any");
    const canEdit =
      (isAuthor && context.auth.can(editOwnCapability)) ||
      context.auth.can(editAnyCapability);
    if (!canEdit) {
      throw errors.FORBIDDEN({ data: { capability: editAnyCapability } });
    }

    const isPublishTransition =
      filtered.status === "published" && existing.status !== "published";
    if (isPublishTransition) {
      const publishCapability = postCapability(existing.type, "publish");
      if (!context.auth.can(publishCapability)) {
        throw errors.FORBIDDEN({ data: { capability: publishCapability } });
      }
    }

    const { id: _id, ...changes } = filtered;
    const patch: Partial<NewPost> = stripUndefined(changes);
    if (isPublishTransition && !existing.publishedAt) {
      patch.publishedAt = new Date();
    }

    if (Object.keys(patch).length === 0) {
      return context.hooks.applyFilter("rpc:post.update:output", existing);
    }

    const preparedFull = await applyPostBeforeSave(context, existing.type, {
      ...existing,
      ...patch,
    });
    const toWrite: Partial<NewPost> = {};
    for (const key of Object.keys(patch) as (keyof NewPost)[]) {
      (toWrite as Record<string, unknown>)[key] = preparedFull[key];
    }

    const where = isPublishTransition
      ? and(eq(posts.id, existing.id), ne(posts.status, "published"))
      : eq(posts.id, existing.id);

    let updated;
    try {
      [updated] = await context.db
        .update(posts)
        .set(toWrite)
        .where(where)
        .returning();
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw errors.CONFLICT({ data: { reason: "slug_taken" } });
      }
      throw error;
    }
    if (!updated) {
      if (isPublishTransition) {
        const current = await context.db.query.posts.findFirst({
          where: eq(posts.id, existing.id),
        });
        if (current) {
          return context.hooks.applyFilter("rpc:post.update:output", current);
        }
      }
      throw errors.CONFLICT({ data: { reason: "update_failed" } });
    }

    await firePostUpdated(context, updated, existing);
    await firePostTransition(context, updated, existing.status);
    if (isPublishTransition) {
      await firePostPublished(context, updated);
    }

    return context.hooks.applyFilter("rpc:post.update:output", updated);
  });
