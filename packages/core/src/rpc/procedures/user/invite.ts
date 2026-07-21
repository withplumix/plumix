import { generateToken, hashToken } from "../../../auth/tokens.js";
import {
  isUniqueConstraintError,
  isUniqueConstraintErrorOn,
} from "../../../db/index.js";
import { authTokens } from "../../../db/schema/auth_tokens.js";
import { users } from "../../../db/schema/users.js";
import { deriveUserSlug, MAX_SLUG_ATTEMPTS } from "../../../users/slug.js";
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

    // Retry a lost slug race (concurrent creates deriving the same base); a
    // `users.email` collision is a real conflict, reported as `email_taken`.
    let created;
    for (let attempt = 1; ; attempt++) {
      const slug = await deriveUserSlug(context.db, filtered.name);
      try {
        [created] = await context.db
          .insert(users)
          .values({
            email: filtered.email,
            slug,
            name: filtered.name ?? null,
            role: filtered.role,
          })
          .returning();
        break;
      } catch (error) {
        const slugRace = isUniqueConstraintErrorOn(error, "users.slug");
        if (slugRace && attempt < MAX_SLUG_ATTEMPTS) continue;
        // A non-slug unique violation is the email collision (the only other
        // unique column on this insert).
        if (!slugRace && isUniqueConstraintError(error)) {
          throw errors.CONFLICT({ data: { reason: "email_taken" } });
        }
        throw error;
      }
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

    // Fires before the output filter so plugins observing invites see the
    // raw created user + token — e.g. an email-delivery plugin needs the
    // token here to compose the invite URL. Parallel to WordPress's
    // `user_register` action hook.
    await context.hooks.doAction("user:invited", created, {
      inviteToken: token,
      invitedBy: context.user.id,
      expiresAt,
    });

    const output = { user: created, inviteToken: token };
    return context.hooks.applyFilter("rpc:user.invite:output", output);
  });
