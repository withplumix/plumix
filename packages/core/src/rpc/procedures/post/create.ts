import type { NewPost } from "../../../db/schema/posts.js";
import { posts } from "../../../db/schema/posts.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { assertContentWithinByteCap } from "./content.js";
import {
  applyPostBeforeSave,
  firePostPublished,
  firePostTransition,
  loadReadableParent,
  postCapability,
} from "./lifecycle.js";
import {
  applyPostMetaReadFilter,
  decodeMetaBag,
  loadPostMeta,
  sanitizeMetaForRpc,
  writePostMetaWithHooks,
} from "./meta.js";
import { postCreateInputSchema } from "./schemas.js";

export const create = base
  .use(authenticated)
  .input(postCreateInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:post.create:input",
      input,
    );

    const createCapability = postCapability(filtered.type, "create");
    if (!context.auth.can(createCapability)) {
      throw errors.FORBIDDEN({ data: { capability: createCapability } });
    }

    const requiresPublishCap =
      filtered.status === "published" || filtered.status === "scheduled";
    if (requiresPublishCap) {
      const publishCapability = postCapability(filtered.type, "publish");
      if (!context.auth.can(publishCapability)) {
        throw errors.FORBIDDEN({ data: { capability: publishCapability } });
      }
    }

    if (filtered.parentId != null) {
      const parent = await loadReadableParent(
        context,
        filtered.type,
        filtered.parentId,
      );
      if (!parent) {
        throw errors.NOT_FOUND({
          data: { kind: "post", id: filtered.parentId },
        });
      }
    }

    assertContentWithinByteCap(filtered.content, errors);

    // Validate meta up-front so a bad key fails before the post insert —
    // keeps the DB clean when the client sends a typo in a meta key.
    const metaPatch = sanitizeMetaForRpc(
      context.plugins,
      filtered.type,
      filtered.meta,
      errors,
    );

    const candidate: NewPost = {
      type: filtered.type,
      title: filtered.title,
      slug: filtered.slug,
      content: filtered.content ?? null,
      excerpt: filtered.excerpt ?? null,
      status: filtered.status,
      parentId: filtered.parentId ?? null,
      menuOrder: filtered.menuOrder,
      authorId: context.user.id,
      publishedAt: filtered.status === "published" ? new Date() : null,
    };

    const prepared = await applyPostBeforeSave(
      context,
      filtered.type,
      candidate,
    );
    prepared.authorId = context.user.id;
    prepared.type = filtered.type;

    const [created] = await context.db
      .insert(posts)
      .values(prepared)
      .onConflictDoNothing({ target: [posts.type, posts.slug] })
      .returning();

    if (!created) {
      throw errors.CONFLICT({ data: { reason: "slug_taken" } });
    }

    let decoded: Record<string, unknown>;
    if (metaPatch) {
      await writePostMetaWithHooks(context, created, metaPatch);
      // `writePostMetaWithHooks` can run filter plugins that mutate the
      // patch, so re-read the column to ship the authoritative bag.
      decoded = await loadPostMeta(context, created.id);
    } else {
      // No write path — `created.meta` is the default `{}`. Decode inline
      // to save the round trip.
      decoded = decodeMetaBag(context.plugins, created.meta);
    }
    const meta = await applyPostMetaReadFilter(context, created, decoded);

    await firePostTransition(context, created, "draft");
    if (created.status === "published") {
      await firePostPublished(context, created);
    }

    return context.hooks.applyFilter("rpc:post.create:output", {
      ...created,
      meta,
    });
  });
