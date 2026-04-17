import { and, desc, eq } from "../../../db/index.js";

import type { Post, PostStatus } from "../../../db/schema/posts.js";
import { posts } from "../../../db/schema/posts.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { postCapability } from "./lifecycle.js";
import { postListInputSchema } from "./schemas.js";

const PUBLIC_STATUS: PostStatus = "published";

export const list = base
  .use(authenticated)
  .input(postListInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:post.list:input",
      input,
    );

    const type = filtered.type ?? "post";
    const readCapability = postCapability(type, "read");
    if (!context.auth.can(readCapability)) {
      throw errors.FORBIDDEN({ data: { capability: readCapability } });
    }

    const canSeeAnyStatus = context.auth.can(postCapability(type, "edit_any"));
    const effectiveStatus = canSeeAnyStatus
      ? filtered.status
      : (filtered.status ?? PUBLIC_STATUS);

    if (!canSeeAnyStatus && effectiveStatus !== PUBLIC_STATUS) {
      return context.hooks.applyFilter(
        "rpc:post.list:output",
        [] as readonly Post[],
      );
    }

    const conditions = [eq(posts.type, type)];
    if (effectiveStatus) conditions.push(eq(posts.status, effectiveStatus));

    const rows = await context.db
      .select()
      .from(posts)
      .where(and(...conditions))
      .orderBy(desc(posts.updatedAt), desc(posts.id))
      .limit(filtered.limit)
      .offset(filtered.offset);

    return context.hooks.applyFilter(
      "rpc:post.list:output",
      rows as readonly Post[],
    );
  });
