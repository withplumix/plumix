import { describe, test } from "vitest";

import type { AuthTokenType } from "../../src/db/schema/auth_tokens.js";
import type { Entry } from "../../src/db/schema/entries.js";
import type { User } from "../../src/db/schema/users.js";
import { createPreviewToken } from "../../src/auth/preview-token.js";
import { eq } from "../../src/db/index.js";
import { AUTH_TOKEN_TYPES } from "../../src/db/schema/auth_tokens.js";
import { users } from "../../src/db/schema/users.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const blogPlugin = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

const site = await testSite({ plugins: [blogPlugin] });

interface GrantsContent {
  /** The URL the token opens a draft at, minted by a user who can edit it. */
  readonly mint: (minter: User, draft: Entry) => Promise<string>;
}

/**
 * Every token type, so a new one has to say whether it opens content. One that
 * does stops working once its minter loses access.
 */
const TOKEN_TYPES: Record<
  AuthTokenType,
  GrantsContent | { opensNoContent: string }
> = {
  preview_link: {
    mint: async (minter, draft) =>
      `/post/${draft.slug}?preview=${await createPreviewToken(site.context.db, {
        entryId: draft.id,
        userId: minter.id,
      })}`,
  },
  webauthn_challenge: {
    opensNoContent: "signs a user in, which checks the account",
  },
  magic_link: { opensNoContent: "signs a user in, which checks the account" },
  email_verification: {
    opensNoContent: "confirms an email address, opens no content",
  },
  invite: { opensNoContent: "creates an account, opens no content" },
  oauth_state: { opensNoContent: "carries sign-in state, opens no content" },
};

async function draftBy(author: User): Promise<Entry> {
  return site.factory.draft.create({ type: "post", authorId: author.id });
}

describe("a token that grants content checks access again when redeemed", () => {
  const grantingContent = AUTH_TOKEN_TYPES.flatMap((type) => {
    const kind = TOKEN_TYPES[type];
    return "mint" in kind ? [{ type, mint: kind.mint }] : [];
  });

  for (const { type, mint } of grantingContent) {
    test(`${type} opens the draft while its minter can edit the entry`, async () => {
      const minter = await site.factory.author.create();
      const draft = await draftBy(minter);

      const page = await site.visit(await mint(minter, draft));

      page.assertOk();
    });

    test(`${type} stops working once its minter can no longer edit the entry`, async () => {
      const minter = await site.factory.author.create();
      const draft = await draftBy(minter);
      const url = await mint(minter, draft);

      await site.context.db
        .update(users)
        .set({ role: "member" })
        .where(eq(users.id, minter.id));

      (await site.visit(url)).assertNotFound();
    });

    test(`${type} stops working once its minter is disabled`, async () => {
      const minter = await site.factory.author.create();
      const draft = await draftBy(minter);
      const url = await mint(minter, draft);

      await site.context.db
        .update(users)
        .set({ disabledAt: new Date() })
        .where(eq(users.id, minter.id));

      (await site.visit(url)).assertNotFound();
    });
  }
});
