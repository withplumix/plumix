import { Factory } from "fishery";

import type { Db } from "../context/app.js";
import type { AuthToken, NewAuthToken } from "../db/schema/auth_tokens.js";
import type {
  Credential,
  CredentialTransport,
  NewCredential,
} from "../db/schema/credentials.js";
import type { NewPost, Post } from "../db/schema/posts.js";
import type { NewTerm, Term } from "../db/schema/terms.js";
import type { NewUser, User } from "../db/schema/users.js";
import { authTokens } from "../db/schema/auth_tokens.js";
import { credentials } from "../db/schema/credentials.js";
import { posts } from "../db/schema/posts.js";
import { terms } from "../db/schema/terms.js";
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

export const termFactory = Factory.define<NewTerm, DbTransient, Term>(
  ({ sequence, transientParams, onCreate, params }) => {
    onCreate(async (attrs) => {
      const db = requireDb(transientParams);
      const [row] = await db.insert(terms).values(attrs).returning();
      if (!row) throw new Error("termFactory: insert returned no row");
      return row;
    });

    return {
      taxonomy: params.taxonomy ?? "category",
      name: params.name ?? `Term ${sequence}`,
      slug: params.slug ?? `term-${sequence}-${Date.now()}`,
      description: params.description ?? null,
      parentId: params.parentId ?? null,
    };
  },
);

export const categoryTerm = termFactory.params({ taxonomy: "category" });
export const tagTerm = termFactory.params({ taxonomy: "tag" });

// Invite factory writes an auth_tokens row of type "invite". The caller
// supplies a user whose id is bound; the default expiry is 24h.
export const inviteFactory = Factory.define<
  NewAuthToken,
  DbTransient,
  AuthToken
>(({ transientParams, onCreate, params }) => {
  onCreate(async (attrs) => {
    const db = requireDb(transientParams);
    const [row] = await db.insert(authTokens).values(attrs).returning();
    if (!row) throw new Error("inviteFactory: insert returned no row");
    return row;
  });

  const userId = params.userId;
  if (userId === undefined) {
    throw new Error("inviteFactory: userId is required");
  }
  return {
    hash: params.hash ?? `invite-hash-${Date.now()}-${Math.random()}`,
    userId,
    email: params.email ?? null,
    type: "invite" as const,
    role: params.role ?? "author",
    invitedBy: params.invitedBy ?? null,
    expiresAt: params.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
});

// Pre-seeded credential for tests that exercise "already registered" flows.
// Callers must supply userId and publicKey; everything else has a sensible
// default. Buffer cast mirrors the runtime pattern in register.ts.
export const credentialFactory = Factory.define<
  NewCredential,
  DbTransient,
  Credential
>(({ sequence, transientParams, onCreate, params }) => {
  onCreate(async (attrs) => {
    const db = requireDb(transientParams);
    const [row] = await db.insert(credentials).values(attrs).returning();
    if (!row) throw new Error("credentialFactory: insert returned no row");
    return row;
  });

  const userId = params.userId;
  if (userId === undefined) {
    throw new Error("credentialFactory: userId is required");
  }
  const publicKey = params.publicKey;
  if (publicKey === undefined) {
    throw new Error("credentialFactory: publicKey is required");
  }
  return {
    id: params.id ?? `cred-${sequence}-${Date.now()}`,
    userId,
    publicKey: publicKey as Buffer,
    counter: params.counter ?? 0,
    deviceType: params.deviceType ?? "single_device",
    isBackedUp: params.isBackedUp ?? false,
    transports: params.transports
      ? [...params.transports]
      : (["internal"] as CredentialTransport[]),
    name: params.name ?? null,
  };
});

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
  readonly term: typeof termFactory;
  readonly category: typeof categoryTerm;
  readonly tag: typeof tagTerm;
  readonly invite: typeof inviteFactory;
  readonly credential: typeof credentialFactory;
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
    term: termFactory.transient({ db }),
    category: categoryTerm.transient({ db }),
    tag: tagTerm.transient({ db }),
    invite: inviteFactory.transient({ db }),
    credential: credentialFactory.transient({ db }),
  };
}
