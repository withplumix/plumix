import { Factory } from "fishery";

import type { Db } from "../context/app.js";
import type {
  AllowedDomain,
  NewAllowedDomain,
} from "../db/schema/allowed_domains.js";
import type { AuthToken, NewAuthToken } from "../db/schema/auth_tokens.js";
import type {
  Credential,
  CredentialTransport,
  NewCredential,
} from "../db/schema/credentials.js";
import type { Entry, NewEntry } from "../db/schema/entries.js";
import type { EntryTerm, NewEntryTerm } from "../db/schema/entry_term.js";
import type { NewSession, Session } from "../db/schema/sessions.js";
import type { NewSetting, Setting } from "../db/schema/settings.js";
import type { NewTerm, Term } from "../db/schema/terms.js";
import type { NewUser, User } from "../db/schema/users.js";
import { allowedDomains } from "../db/schema/allowed_domains.js";
import { authTokens } from "../db/schema/auth_tokens.js";
import { credentials } from "../db/schema/credentials.js";
import { entries } from "../db/schema/entries.js";
import { entryTerm } from "../db/schema/entry_term.js";
import { sessions } from "../db/schema/sessions.js";
import { settings } from "../db/schema/settings.js";
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

export const entryFactory = Factory.define<NewEntry, DbTransient, Entry>(
  ({ sequence, transientParams, onCreate, params }) => {
    onCreate(async (attrs) => {
      const db = requireDb(transientParams);
      const [row] = await db.insert(entries).values(attrs).returning();
      if (!row) throw new Error("entryFactory: insert returned no row");
      return row;
    });

    const status = params.status ?? "draft";
    const authorId = params.authorId;
    if (authorId === undefined) {
      throw new Error("entryFactory: authorId is required");
    }
    return {
      type: params.type ?? "post",
      title: params.title ?? `Entry ${sequence}`,
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

export const draftEntry = entryFactory.params({ status: "draft" });
export const publishedEntry = entryFactory.params({ status: "published" });
export const trashedEntry = entryFactory.params({ status: "trash" });

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

// Session factory — seeds a row without running the WebAuthn dance. Useful
// for admin-UI tests that want an authenticated context straight away.
export const sessionFactory = Factory.define<NewSession, DbTransient, Session>(
  ({ sequence, transientParams, onCreate, params }) => {
    onCreate(async (attrs) => {
      const db = requireDb(transientParams);
      const [row] = await db.insert(sessions).values(attrs).returning();
      if (!row) throw new Error("sessionFactory: insert returned no row");
      return row;
    });

    const userId = params.userId;
    if (userId === undefined) {
      throw new Error("sessionFactory: userId is required");
    }
    return {
      id: params.id ?? `session-${sequence}-${Date.now()}`,
      userId,
      expiresAt: params.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    };
  },
);

// Settings row (group, key, value). Caller supplies `group` and `key`;
// `value` defaults to an empty string so tests that care only about
// existence don't need to pass it.
export const settingFactory = Factory.define<NewSetting, DbTransient, Setting>(
  ({ sequence, transientParams, onCreate, params }) => {
    onCreate(async (attrs) => {
      const db = requireDb(transientParams);
      const [row] = await db.insert(settings).values(attrs).returning();
      if (!row) throw new Error("settingFactory: insert returned no row");
      return row;
    });

    return {
      group: params.group ?? `group_${sequence}`,
      key: params.key ?? `key_${sequence}`,
      value: params.value ?? "",
    };
  },
);

// entry_term join row. Caller passes entryId + termId; sortOrder defaults to 0.
export const entryTermFactory = Factory.define<
  NewEntryTerm,
  DbTransient,
  EntryTerm
>(({ transientParams, onCreate, params }) => {
  onCreate(async (attrs) => {
    const db = requireDb(transientParams);
    const [row] = await db.insert(entryTerm).values(attrs).returning();
    if (!row) throw new Error("entryTermFactory: insert returned no row");
    return row;
  });

  const entryId = params.entryId;
  const termId = params.termId;
  if (entryId === undefined || termId === undefined) {
    throw new Error("entryTermFactory: entryId and termId are required");
  }
  return {
    entryId,
    termId,
    sortOrder: params.sortOrder ?? 0,
  };
});

// Allowed-domain entry for tests that exercise domain-gated self-signup.
export const allowedDomainFactory = Factory.define<
  NewAllowedDomain,
  DbTransient,
  AllowedDomain
>(({ sequence, transientParams, onCreate, params }) => {
  onCreate(async (attrs) => {
    const db = requireDb(transientParams);
    const [row] = await db.insert(allowedDomains).values(attrs).returning();
    if (!row) throw new Error("allowedDomainFactory: insert returned no row");
    return row;
  });

  return {
    domain: params.domain ?? `example-${sequence}.test`,
    defaultRole: params.defaultRole ?? "subscriber",
    isEnabled: params.isEnabled ?? true,
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
  readonly entry: typeof entryFactory;
  readonly draft: typeof draftEntry;
  readonly published: typeof publishedEntry;
  readonly trashed: typeof trashedEntry;
  readonly term: typeof termFactory;
  readonly category: typeof categoryTerm;
  readonly tag: typeof tagTerm;
  readonly invite: typeof inviteFactory;
  readonly credential: typeof credentialFactory;
  readonly session: typeof sessionFactory;
  readonly setting: typeof settingFactory;
  readonly entryTerm: typeof entryTermFactory;
  readonly allowedDomain: typeof allowedDomainFactory;
}

export function factoriesFor(db: Db): Factories {
  return {
    user: userFactory.transient({ db }),
    admin: adminUser.transient({ db }),
    editor: editorUser.transient({ db }),
    author: authorUser.transient({ db }),
    contributor: contributorUser.transient({ db }),
    subscriber: subscriberUser.transient({ db }),
    entry: entryFactory.transient({ db }),
    draft: draftEntry.transient({ db }),
    published: publishedEntry.transient({ db }),
    trashed: trashedEntry.transient({ db }),
    term: termFactory.transient({ db }),
    category: categoryTerm.transient({ db }),
    tag: tagTerm.transient({ db }),
    invite: inviteFactory.transient({ db }),
    credential: credentialFactory.transient({ db }),
    session: sessionFactory.transient({ db }),
    setting: settingFactory.transient({ db }),
    entryTerm: entryTermFactory.transient({ db }),
    allowedDomain: allowedDomainFactory.transient({ db }),
  };
}
