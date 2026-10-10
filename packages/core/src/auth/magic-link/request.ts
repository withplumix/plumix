import type { Db, Logger } from "../../context/app-context.js";
import type { User } from "../../db/schema/users.js";
import type { MailSender } from "../../mail/contract/registry.js";
import { withBasePath } from "../../base-path.js";
import { and, eq, gte } from "../../db/index.js";
import { allowedDomains } from "../../db/schema/allowed_domains.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { users } from "../../db/schema/users.js";
import { extractDomain } from "../identity.js";
import { generateToken, hashToken } from "../tokens.js";

// Long enough to survive email delivery, short enough that a leaked link is
// mostly stale.
const MAGIC_LINK_TTL_SECONDS = 15 * 60;

// Jitter on silent branches so timing can't tell a registered email apart;
// approximates token generation plus the mailer round-trip.
const TIMING_DELAY_MIN_MS = 100;
const TIMING_DELAY_RANGE_MS = 150;

// Per-email cap stops open self-signup becoming an email-bomb amplifier.
// Applied on sign-in too so it can't probe which addresses are registered.
const MAGIC_LINK_MAX_PER_WINDOW = 5;
const MAGIC_LINK_WINDOW_MS = 15 * 60 * 1000;

interface RequestMagicLinkInput {
  readonly email: string;
  readonly origin: string;
  readonly basePath: string;
  readonly mail: MailSender;
  readonly ttlSeconds?: number;
  readonly logger?: Pick<Logger, "warn">;
  // Must already have passed `isSafeRedirect`; the verify route re-validates
  // it.
  readonly redirectTo?: string;
  readonly bootstrapAllowed?: boolean;
  readonly selfSignupOpen?: boolean;
}

/**
 * Never throws and behaves identically on every branch (sign-in, signup,
 * no-op), so neither timing nor shape reveals whether the email is registered.
 * Mailer errors are logged.
 */
export async function requestMagicLink(
  db: Db,
  input: RequestMagicLinkInput,
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const ttlSeconds = input.ttlSeconds ?? MAGIC_LINK_TTL_SECONDS;

  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (user && !user.disabledAt) {
    await issueAndSend(db, input, ttlSeconds, {
      userId: user.id,
      email: user.email,
      recipient: user,
    });
    return;
  }
  if (user?.disabledAt) {
    await timingDelay();
    return;
  }

  const domain = extractDomain(email);
  if (!domain) {
    await timingDelay();
    return;
  }
  if (!input.selfSignupOpen) {
    const allowed = await db.query.allowedDomains.findFirst({
      where: eq(allowedDomains.domain, domain),
    });
    if (!allowed?.isEnabled) {
      await timingDelay();
      return;
    }
  }
  if (!input.bootstrapAllowed) {
    const userCount = await db.$count(users);
    if (userCount === 0) {
      await timingDelay();
      return;
    }
  }

  await issueAndSend(db, input, ttlSeconds, {
    userId: null,
    email,
    recipient: email,
  });
}

interface IssueAndSendInput {
  readonly userId: number | null;
  readonly email: string;
  readonly recipient: User | string;
}

async function issueAndSend(
  db: Db,
  input: RequestMagicLinkInput,
  ttlSeconds: number,
  target: IssueAndSendInput,
): Promise<void> {
  if (await issuanceCapReached(db, target.email)) {
    // Indistinguishable from an unknown-email request.
    await timingDelay();
    return;
  }

  const token = generateToken();
  const hash = await hashToken(token);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await db.insert(authTokens).values({
    hash,
    userId: target.userId,
    email: target.email,
    type: "magic_link",
    expiresAt,
  });

  const verifyUrl = new URL(
    withBasePath("/_plumix/auth/magic-link/verify", input.basePath),
    input.origin,
  );
  verifyUrl.searchParams.set("token", token);
  if (input.redirectTo !== undefined) {
    verifyUrl.searchParams.set("redirectTo", input.redirectTo);
  }

  try {
    await input.mail.send(
      "magicLink",
      { url: verifyUrl.toString(), ttlSeconds },
      { to: target.recipient },
    );
  } catch (error) {
    // Surfacing this would leak that the recipient is registered.
    input.logger?.warn("magic_link_mailer_failed", { error });
  }
}

async function issuanceCapReached(db: Db, email: string): Promise<boolean> {
  const since = new Date(Date.now() - MAGIC_LINK_WINDOW_MS);
  const recent = await db.$count(
    authTokens,
    and(
      eq(authTokens.email, email),
      eq(authTokens.type, "magic_link"),
      gte(authTokens.createdAt, since),
    ),
  );
  return recent >= MAGIC_LINK_MAX_PER_WINDOW;
}

function timingDelay(): Promise<void> {
  const ms = TIMING_DELAY_MIN_MS + Math.random() * TIMING_DELAY_RANGE_MS;
  return new Promise((resolve) => setTimeout(resolve, ms));
}
