import { asc, eq } from "../../../../db/index.js";
import { credentials } from "../../../../db/schema/credentials.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { credentialsListInputSchema } from "./schemas.js";

// Returns the *current user's* registered passkeys. Self-scoped — no
// capability check; users always see their own credentials. Drops the
// raw `publicKey` blob (binary, useless to the admin UI, and a chunky
// payload to ship over the wire on every list call).
export const list = base
  .use(authenticated)
  .input(credentialsListInputSchema)
  .handler(async ({ context }) => {
    return context.db
      .select({
        id: credentials.id,
        name: credentials.name,
        isBackedUp: credentials.isBackedUp,
        transports: credentials.transports,
        createdAt: credentials.createdAt,
        lastUsedAt: credentials.lastUsedAt,
      })
      .from(credentials)
      .where(eq(credentials.userId, context.user.id))
      .orderBy(asc(credentials.createdAt));
  });
