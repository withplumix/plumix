import { Factory } from "fishery";

import type { Db } from "../context/app.js";
import type { NewPost, Post } from "../db/schema/posts.js";
import type { NewUser, User } from "../db/schema/users.js";
import { posts } from "../db/schema/posts.js";
import { users } from "../db/schema/users.js";

interface DbTransient {
  db: Db;
}

function requireDb(transient: Partial<DbTransient>): Db {
  if (!transient.db) {
    throw new Error(
      "factory requires a db via .transient({ db }) or factoriesFor(db)",
    );
  }
  return transient.db;
}

export const userFactory = Factory.define<NewUser, DbTransient, User>(
  ({ sequence, transientParams, onCreate, params }) => {
    onCreate(async (attrs) => {
      const db = requireDb(transientParams);
      const [row] = await db.insert(users).values(attrs).returning();
      if (!row) throw new Error("userFactory: insert returned no row");
      return row;
    });

    return {
      email: params.email ?? `user-${sequence}@example.test`,
      name: params.name ?? null,
      role: params.role ?? "subscriber",
    };
  },
);

export const adminUser = userFactory.params({ role: "admin" });
export const editorUser = userFactory.params({ role: "editor" });
export const authorUser = userFactory.params({ role: "author" });
export const contributorUser = userFactory.params({ role: "contributor" });
export const subscriberUser = userFactory.params({ role: "subscriber" });

export const postFactory = Factory.define<NewPost, DbTransient, Post>(
  ({ sequence, transientParams, onCreate, params }) => {
    onCreate(async (attrs) => {
      const db = requireDb(transientParams);
      const [row] = await db.insert(posts).values(attrs).returning();
      if (!row) throw new Error("postFactory: insert returned no row");
      return row;
    });

    const status = params.status ?? "draft";
    const authorId = params.authorId;
    if (authorId === undefined) {
      throw new Error("postFactory: authorId is required");
    }
    return {
      type: params.type ?? "post",
      title: params.title ?? `Post ${sequence}`,
      slug: params.slug ?? `post-${sequence}-${Date.now()}`,
      content: params.content ?? null,
      excerpt: params.excerpt ?? null,
      status,
      parentId: params.parentId ?? null,
      menuOrder: params.menuOrder ?? 0,
      publishedAt:
        params.publishedAt ?? (status === "published" ? new Date() : null),
      authorId,
    };
  },
);

export const draftPost = postFactory.params({ status: "draft" });
export const publishedPost = postFactory.params({ status: "published" });
export const trashedPost = postFactory.params({ status: "trash" });

export interface Factories {
  readonly user: typeof userFactory;
  readonly admin: typeof adminUser;
  readonly editor: typeof editorUser;
  readonly author: typeof authorUser;
  readonly contributor: typeof contributorUser;
  readonly subscriber: typeof subscriberUser;
  readonly post: typeof postFactory;
  readonly draft: typeof draftPost;
  readonly published: typeof publishedPost;
  readonly trashed: typeof trashedPost;
}

export function factoriesFor(db: Db): Factories {
  return {
    user: userFactory.transient({ db }),
    admin: adminUser.transient({ db }),
    editor: editorUser.transient({ db }),
    author: authorUser.transient({ db }),
    contributor: contributorUser.transient({ db }),
    subscriber: subscriberUser.transient({ db }),
    post: postFactory.transient({ db }),
    draft: draftPost.transient({ db }),
    published: publishedPost.transient({ db }),
    trashed: trashedPost.transient({ db }),
  };
}
