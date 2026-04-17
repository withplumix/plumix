import { eq } from "../../../db/index.js";

import { posts } from "../../../db/schema/posts.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { firePostTrashed, postCapability } from "./lifecycle.js";
import { postTrashInputSchema } from "./schemas.js";

export const trash = base
  .use(authenticated)
  .input(postTrashInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:post.trash:input",
      input,
    );

    const existing = await context.db.query.posts.findFirst({
      where: eq(posts.id, filtered.id),
    });
    if (!existing) {
      throw errors.NOT_FOUND({ data: { kind: "post", id: filtered.id } });
    }

    const deleteCapability = postCapability(existing.type, "delete");
    if (!context.auth.can(deleteCapability)) {
      throw errors.FORBIDDEN({ data: { capability: deleteCapability } });
    }
    const isAuthor = existing.authorId === context.user.id;
    if (!isAuthor) {
      const editAnyCapability = postCapability(existing.type, "edit_any");
      if (!context.auth.can(editAnyCapability)) {
        throw errors.FORBIDDEN({ data: { capability: editAnyCapability } });
      }
    }

    if (existing.status === "trash") {
      return context.hooks.applyFilter("rpc:post.trash:output", existing);
    }

    const [trashed] = await context.db
      .update(posts)
      .set({ status: "trash" })
      .where(eq(posts.id, existing.id))
      .returning();
    if (!trashed) {
      throw errors.CONFLICT({ data: { reason: "trash_failed" } });
    }

    await firePostTrashed(context, trashed);
    return context.hooks.applyFilter("rpc:post.trash:output", trashed);
  });
