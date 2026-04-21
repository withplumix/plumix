import type { AppContext } from "../../../context/app.js";
import type { NewPost } from "../../../db/schema/posts.js";
import {
  and,
  eq,
  inArray,
  isUniqueConstraintError,
  ne,
} from "../../../db/index.js";
import { postTerm } from "../../../db/schema/post_term.js";
import { posts } from "../../../db/schema/posts.js";
import { terms } from "../../../db/schema/terms.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { stripUndefined } from "./helpers.js";
import {
  applyPostBeforeSave,
  firePostPublished,
  firePostTransition,
  firePostUpdated,
  loadReadableParent,
  postCapability,
  wouldCreateParentCycle,
} from "./lifecycle.js";
import {
  applyPostMetaReadFilter,
  isEmptyMetaPatch,
  loadPostMeta,
  sanitizeMetaForRpc,
  writePostMetaWithHooks,
} from "./meta.js";
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

    // Reparenting: caller may only point at posts they can see, and the
    // parent must share the current post's type. Undistinguished 404 on
    // any failure — don't leak whether the parent exists. Also walk the
    // chain upward to reject cycles of any depth (self-parent, A→B→A, …) —
    // admin UI tree renders will infinite-loop on any cycle in the DB.
    if (filtered.parentId != null && filtered.parentId !== existing.parentId) {
      const parent = await loadReadableParent(
        context,
        existing.type,
        filtered.parentId,
      );
      if (!parent) {
        throw errors.NOT_FOUND({
          data: { kind: "post", id: filtered.parentId },
        });
      }
      const cycle = await wouldCreateParentCycle(
        context,
        existing.id,
        parent.id,
      );
      if (cycle) {
        throw errors.CONFLICT({ data: { reason: "parent_cycle" } });
      }
    }

    // `terms` and `meta` aren't posts.* columns — split them out and
    // validate up front so a bad taxonomy/cap/meta key fails fast,
    // before any write happens.
    const {
      id: _id,
      terms: termsPatch,
      meta: metaInput,
      ...changes
    } = filtered;
    const metaPatch = sanitizeMetaForRpc(
      context.plugins,
      existing.type,
      metaInput,
      errors,
    );
    if (termsPatch !== undefined) {
      for (const taxonomy of Object.keys(termsPatch)) {
        if (!context.plugins.taxonomies.has(taxonomy)) {
          throw errors.NOT_FOUND({ data: { kind: "taxonomy", id: taxonomy } });
        }
        const assignCap = `${taxonomy}:assign`;
        if (!context.auth.can(assignCap)) {
          throw errors.FORBIDDEN({ data: { capability: assignCap } });
        }
      }
      for (const [taxonomy, termIds] of Object.entries(termsPatch)) {
        const unique = Array.from(new Set(termIds));
        if (unique.length === 0) continue;
        const rows = await context.db
          .select({ id: terms.id })
          .from(terms)
          .where(and(eq(terms.taxonomy, taxonomy), inArray(terms.id, unique)));
        if (rows.length !== unique.length) {
          throw errors.CONFLICT({ data: { reason: "term_taxonomy_mismatch" } });
        }
      }
    }

    const patch: Partial<NewPost> = stripUndefined(changes);
    if (isPublishTransition && !existing.publishedAt) {
      patch.publishedAt = new Date();
    }

    // Nothing to write anywhere? Short-circuit without firing hooks, but
    // still return the current meta so callers get a consistent shape. An
    // empty meta map from the client (e.g. admin always sending `meta: {}`)
    // counts as no-op on the meta side too.
    if (
      Object.keys(patch).length === 0 &&
      termsPatch === undefined &&
      isEmptyMetaPatch(metaPatch)
    ) {
      const loaded = await loadPostMeta(context, existing.id);
      const meta = await applyPostMetaReadFilter(context, existing, loaded);
      return context.hooks.applyFilter("rpc:post.update:output", {
        ...existing,
        meta,
      });
    }

    let updated = existing;
    let postColumnsWritten = false;
    if (Object.keys(patch).length > 0) {
      const preparedFull = await applyPostBeforeSave(context, existing.type, {
        ...existing,
        ...patch,
      });
      const toWrite: Partial<NewPost> = {};
      for (const key of Object.keys(patch) as (keyof NewPost)[]) {
        (toWrite as Record<string, unknown>)[key] = preparedFull[key];
      }

      // The ne(status, "published") guard on publish transitions can match
      // zero rows if another request won the publish race.
      const where = isPublishTransition
        ? and(eq(posts.id, existing.id), ne(posts.status, "published"))
        : eq(posts.id, existing.id);

      let row;
      try {
        [row] = await context.db
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
      if (row) {
        updated = row;
        postColumnsWritten = true;
      } else if (isPublishTransition) {
        // Race-lost: someone published between our read and write. Return the
        // current state as observed, do not fire the updated/published hooks.
        const current = await context.db.query.posts.findFirst({
          where: eq(posts.id, existing.id),
        });
        if (!current) {
          throw errors.CONFLICT({ data: { reason: "update_failed" } });
        }
        updated = current;
      } else {
        throw errors.CONFLICT({ data: { reason: "update_failed" } });
      }
    }

    if (termsPatch !== undefined) {
      await applyTermPatch(context, updated.id, termsPatch);
    }

    // `writePostMetaWithHooks` is a no-op on an empty patch, so the null
    // check here is the only gate we need — no separate empty-patch check.
    if (metaPatch) {
      await writePostMetaWithHooks(context, updated, metaPatch);
    }
    const loaded = await loadPostMeta(context, updated.id);
    const meta = await applyPostMetaReadFilter(context, updated, loaded);

    if (postColumnsWritten) {
      await firePostUpdated(context, updated, existing);
      await firePostTransition(context, updated, existing.status);
      if (isPublishTransition) {
        await firePostPublished(context, updated);
      }
    }

    return context.hooks.applyFilter("rpc:post.update:output", {
      ...updated,
      meta,
    });
  });

/** Replace post_term rows for every (postId, taxonomy) pair in the patch. */
async function applyTermPatch(
  context: AppContext,
  postId: number,
  termsPatch: Record<string, readonly number[]>,
): Promise<void> {
  for (const [taxonomy, termIds] of Object.entries(termsPatch)) {
    const unique = Array.from(new Set(termIds));
    // Scope the delete to rows whose term belongs to this taxonomy — saves
    // a per-term round-trip and avoids accidentally wiping another taxonomy's
    // rows in the same post_term table.
    const existingAssignments = await context.db
      .select({ termId: postTerm.termId })
      .from(postTerm)
      .innerJoin(terms, eq(postTerm.termId, terms.id))
      .where(and(eq(postTerm.postId, postId), eq(terms.taxonomy, taxonomy)));
    if (existingAssignments.length > 0) {
      const ids = existingAssignments.map((r) => r.termId);
      await context.db
        .delete(postTerm)
        .where(and(eq(postTerm.postId, postId), inArray(postTerm.termId, ids)));
    }

    if (unique.length > 0) {
      // onConflictDoNothing handles the race where a concurrent update
      // beat us to inserting the same (postId, termId) row — the desired
      // end state (row exists) is reached regardless of which request
      // inserted it. Without this, the second request would bubble a PK
      // violation up as a 500.
      await context.db
        .insert(postTerm)
        .values(
          unique.map((termId, index) => ({
            postId,
            termId,
            sortOrder: index,
          })),
        )
        .onConflictDoNothing({
          target: [postTerm.postId, postTerm.termId],
        });
    }
  }
}
