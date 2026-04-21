import { eq } from "../../../db/index.js";
import { posts } from "../../../db/schema/posts.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { postCapability } from "./lifecycle.js";
import { applyPostMetaReadFilter, loadPostMeta } from "./meta.js";
import { postGetInputSchema } from "./schemas.js";

export const get = base
  .use(authenticated)
  .input(postGetInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:post.get:input",
      input,
    );

    const row = await context.db.query.posts.findFirst({
      where: eq(posts.id, filtered.id),
    });
    if (!row) {
      throw errors.NOT_FOUND({ data: { kind: "post", id: filtered.id } });
    }

    if (!context.auth.can(postCapability(row.type, "read"))) {
      throw errors.NOT_FOUND({ data: { kind: "post", id: filtered.id } });
    }

    if (row.status !== "published") {
      const canSeeAny = context.auth.can(postCapability(row.type, "edit_any"));
      const ownsAndCanEdit =
        row.authorId === context.user.id &&
        context.auth.can(postCapability(row.type, "edit_own"));
      if (!canSeeAny && !ownsAndCanEdit) {
        throw errors.NOT_FOUND({ data: { kind: "post", id: filtered.id } });
      }
    }

    const loaded = await loadPostMeta(context.db, context.plugins, row.id);
    const meta = await applyPostMetaReadFilter(context, row, loaded);
    return context.hooks.applyFilter("rpc:post.get:output", { ...row, meta });
  });
