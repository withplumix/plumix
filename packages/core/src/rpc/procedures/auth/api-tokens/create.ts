import { createApiToken } from "../../../../auth/api-tokens.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { apiTokensCreateInputSchema } from "./schemas.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Mints a new personal access token for the calling user. The raw
// secret is returned in the response *exactly once* — the admin UI
// shows a copy-to-clipboard panel and warns the user it won't be
// shown again. The DB stores only the SHA-256 hash + a short
// recognisable prefix fragment.
//
// Self-scoped: no capability check beyond `authenticated`. Tokens
// inherit the user's current role/capabilities at request time, so
// minting requires no extra privilege beyond being authed.
export const create = base
  .use(authenticated)
  .input(apiTokensCreateInputSchema)
  .handler(async ({ input, context }) => {
    const expiresAt =
      input.expiresInDays === null
        ? null
        : new Date(Date.now() + input.expiresInDays * MS_PER_DAY);

    const minted = await createApiToken(context.db, {
      userId: context.user.id,
      name: input.name,
      expiresAt,
      scopes: input.scopes,
    });

    return {
      // The full secret — show once, never recoverable.
      secret: minted.secret,
      token: {
        id: minted.row.id,
        name: minted.row.name,
        prefix: minted.row.prefix,
        expiresAt: minted.row.expiresAt,
        lastUsedAt: minted.row.lastUsedAt,
        createdAt: minted.row.createdAt,
        scopes: minted.row.scopes,
      },
    };
  });
