import type { AppContext } from "../context/app-context.js";
import type { User } from "../db/schema/users.js";
import type { JsonValue } from "../json.js";
import type {
  AccountProof,
  AuthMethodKernel,
  EmailProof,
  IdentityProof,
  IdentityRefusalCode,
  ProveAccountOptions,
} from "../plugin/auth-method.js";
import type { DeclaredAuthMethod } from "./declared-methods.js";
import type { AuthFlowApp } from "./flow-app.js";
import type { AuthTransport } from "./transport.js";
import { withBasePath } from "../base-path.js";
import { eq } from "../db/index.js";
import { users } from "../db/schema/users.js";
import { startingMeta } from "../plugin/fields/starting-meta.js";
import { listUserMetaFields } from "../plugin/manifest.js";
import { jsonResponse } from "../runtime/contract/http.js";
import { resolveLoginPath } from "./config.js";
import { ExternalIdentityError, resolveExternalIdentity } from "./identity.js";
import { optionalRedirectTo } from "./redirect.js";
import { announceSignIn, mintSessionAndCookie } from "./sign-in.js";
import { redirectFor, transportOf } from "./transport.js";

const ADMIN_PATH = "/_plumix/admin";

const IDENTITY_REFUSAL_CODES: ReadonlySet<string> =
  new Set<IdentityRefusalCode>([
    "email_unverified",
    "account_disabled",
    "domain_not_allowed",
    "registration_closed",
    "link_broken",
  ]);

interface AuthMethodKernelInput {
  readonly ctx: AppContext;
  readonly app: AuthFlowApp;
  readonly declared: DeclaredAuthMethod;
  readonly params: Readonly<Record<string, string>>;
}

interface ProvenAccount {
  readonly user: User;
  readonly firstSignIn: boolean;
}

export function createAuthMethodKernel(
  input: AuthMethodKernelInput,
): AuthMethodKernel {
  const { ctx, app, declared, params } = input;
  const { request } = ctx;
  const { key } = declared;
  const { basePath } = app.config;
  const transport = transportOf(request);
  const loginPath = withBasePath(resolveLoginPath(app.config.auth), basePath);

  const loginUrl = (param: string, value: string): string =>
    `${loginPath}?${new URLSearchParams({ [param]: value }).toString()}`;

  const readRedirectTo = (value?: string): string | undefined =>
    optionalRedirectTo(
      value ?? new URL(request.url).searchParams.get("redirectTo"),
      basePath,
    );

  const kernel: AuthMethodKernel = {
    request,
    ctx,
    params,
    loginPath,
    readInput: () => readInput(request, transport),
    readRedirectTo,
    fail(code, options = {}) {
      if (transport === "fetch") {
        return jsonResponse({ error: code }, { status: options.status ?? 400 });
      }
      return redirectFor(transport, loginUrl(`${key}_error`, code));
    },
    notice(name, body = { ok: true }) {
      if (transport === "fetch") return jsonResponse(body);
      return redirectFor(transport, loginUrl(`${key}_${name}`, "1"));
    },
    async proveIdentity(
      proof: IdentityProof,
      options: ProveAccountOptions = {},
    ) {
      let proven: ProvenAccount;
      try {
        proven =
          "userId" in proof
            ? await proveAccount(ctx, proof, options.firstSignIn ?? false)
            : await proveEmail(ctx, app, proof);
      } catch (error) {
        if (
          error instanceof ExternalIdentityError &&
          IDENTITY_REFUSAL_CODES.has(error.code)
        ) {
          ctx.logger.warn("sign_in_refused", { method: key, code: error.code });
          return kernel.fail(error.code, { status: 403 });
        }
        throw error;
      }
      const { user, firstSignIn } = proven;
      const { cookieHeader } = await mintSessionAndCookie(ctx, app, user.id);
      await options.afterSession?.(user);
      const provider =
        "providerAccount" in proof
          ? proof.providerAccount?.provider
          : undefined;
      await announceSignIn(
        ctx,
        user,
        provider === undefined
          ? { method: key, firstSignIn }
          : { method: key, provider, firstSignIn },
      );
      const redirectTo =
        readRedirectTo(options.redirectTo) ??
        withBasePath(ADMIN_PATH, basePath);
      const cookie = { "set-cookie": cookieHeader };
      if (transport === "fetch") {
        return jsonResponse(
          { userId: user.id, redirectTo },
          { headers: cookie },
        );
      }
      return redirectFor(transport, redirectTo, cookie);
    },
  };
  return kernel;
}

async function readInput(
  request: Request,
  transport: AuthTransport,
): Promise<JsonValue> {
  try {
    if (transport === "fetch") return (await request.json()) as JsonValue;
    const fields: Record<string, string> = {};
    for (const [name, value] of await request.formData()) {
      if (typeof value === "string") fields[name] = value;
    }
    return fields;
  } catch {
    return null;
  }
}

async function proveAccount(
  ctx: AppContext,
  proof: AccountProof,
  firstSignIn: boolean,
): Promise<ProvenAccount> {
  const user = await ctx.db.query.users.findFirst({
    where: eq(users.id, proof.userId),
  });
  if (!user) throw ExternalIdentityError.linkBroken();
  if (user.disabledAt) throw ExternalIdentityError.accountDisabled();
  return { user, firstSignIn };
}

async function proveEmail(
  ctx: AppContext,
  app: AuthFlowApp,
  proof: EmailProof,
): Promise<ProvenAccount> {
  const { selfSignup } = app.config.auth;
  const { user, created } = await resolveExternalIdentity(ctx.db, {
    email: proof.email.trim().toLowerCase(),
    emailVerified: proof.emailVerified,
    name: proof.profile?.name,
    avatarUrl: proof.profile?.avatarUrl,
    providerAccount: proof.providerAccount,
    bootstrapAllowed: ctx.bootstrapAllowed,
    allowedDomainsGate: selfSignup === undefined,
    defaultRole: selfSignup?.defaultRole,
    meta: startingMeta(listUserMetaFields(ctx.plugins)),
  });
  return { user, firstSignIn: created };
}
