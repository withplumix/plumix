import * as v from "valibot";

const tokenNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "name must be non-empty"),
  v.maxLength(64, "name must be ≤ 64 chars"),
  // CR/LF defense: same rationale as other label fields — a future
  // audit-log consumer might splice this into a line-oriented format.
  v.regex(/^[^\r\n]+$/, "name must not contain newlines"),
);

/**
 * SHA-256 hex (64 chars) — what `hashToken` produces. 128-char ceiling
 * guards against pathological hostile input on the receiving handler.
 */
const tokenIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(128));

/**
 * `null` means never expires. The 5-year cap stands in for a rotation
 * policy we don't have.
 */
const expiresInDaysSchema = v.union([
  v.null(),
  v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(365 * 5)),
]);

/**
 * Capability strings — `entry:post:read`, `settings:manage`, etc.
 * Same shape as device-flow's scope schema (kept in sync).
 */
const capabilitySchema = v.pipe(
  v.string(),
  v.minLength(1, "capability must be non-empty"),
  v.maxLength(96, "capability must be ≤ 96 chars"),
  v.regex(/^[A-Za-z0-9_:.\-*]+$/, "capability uses [A-Za-z0-9_:.\\-*] only"),
);

/**
 * `null` inherits the role's caps; an array narrows to it. `[]` is legal: the
 * token authenticates but every `auth.can` is false. Capped at 128 against a
 * hostile self-mint.
 */
const scopesSchema = v.optional(
  v.union([
    v.null(),
    v.pipe(v.array(capabilitySchema), v.maxLength(128, "≤ 128 scopes")),
  ]),
  null,
);

export const apiTokensListInputSchema = v.optional(v.object({}), {});

export const apiTokensCreateInputSchema = v.object({
  name: tokenNameSchema,
  expiresInDays: v.optional(expiresInDaysSchema, 90),
  scopes: scopesSchema,
});

export const apiTokensRevokeInputSchema = v.object({
  id: tokenIdSchema,
});

// Separate from the self-scope schemas so audit can attribute admin actions.

const userIdSchema = v.pipe(v.number(), v.integer(), v.minValue(1));
const limitSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(200),
);
const offsetSchema = v.pipe(v.number(), v.integer(), v.minValue(0));

export const apiTokensAdminListInputSchema = v.optional(
  v.object({
    /** When set, filter to a single user's tokens. Otherwise: all users. */
    userId: v.optional(userIdSchema),
    /** Page size. Default 50, hard cap 200. */
    limit: v.optional(limitSchema, 50),
    /** Page offset. */
    offset: v.optional(offsetSchema, 0),
    /**
     * Include revoked rows. Default false (the hot UI path is "active
     * tokens"). Set to true for an audit-style view.
     */
    includeRevoked: v.optional(v.boolean(), false),
  }),
  {},
);

export const apiTokensAdminRevokeInputSchema = v.object({
  id: tokenIdSchema,
});
