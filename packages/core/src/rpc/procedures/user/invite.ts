import { generateToken, hashToken } from "../../../auth/tokens.js";
import { isUniqueConstraintError } from "../../../db/index.js";
import { authTokens } from "../../../db/schema/auth_tokens.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { userInviteInputSchema } from "./schemas.js";

const CREATE_CAPABILITY = "user:create";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const invite = base
  .use(authenticated)
  .input(userInviteInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(CREATE_CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CREATE_CAPABILITY } });
    }
    const filtered = await context.hooks.applyFilter(
      "rpc:user.invite:input",
      input,
    );

    const token = generateToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    let created;
    try {
      [created] = await context.db
        .insert(users)
        .values({
          email: filtered.email,
          name: filtered.name ?? null,
          role: filtered.role,
        })
        .returning();
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw errors.CONFLICT({ data: { reason: "email_taken" } });
      }
      throw error;
    }
    if (!created) {
      throw errors.CONFLICT({ data: { reason: "insert_failed" } });
    }

    await context.db.insert(authTokens).values({
      hash: tokenHash,
      userId: created.id,
      email: filtered.email,
      type: "invite",
      role: filtered.role,
      invitedBy: context.user.id,
      expiresAt,
    });

    const output = { user: created, inviteToken: token };
    return context.hooks.applyFilter("rpc:user.invite:output", output);
  });
