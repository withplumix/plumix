import { createApiToken } from "../../../../auth/api-tokens.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { apiTokensCreateInputSchema } from "./schemas.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// The raw secret is returned exactly once; the DB stores only its hash and
// prefix. No capability beyond `authenticated`: tokens inherit the user's
// role at request time.
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

    await context.hooks.doAction(
      "api_token:created",
      {
        id: minted.row.id,
        userId: minted.row.userId,
        name: minted.row.name,
        prefix: minted.row.prefix,
        scopes: minted.row.scopes,
        expiresAt: minted.row.expiresAt,
      },
      { actor: context.user },
      context,
    );

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
