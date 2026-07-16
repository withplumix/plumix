import type {
  AuthMethodDescriptor,
  RuntimeDescriptor,
} from "./compose/types.js";
import { ScaffoldError } from "./errors.js";

// Passkey is always emitted (it is mandatory and zero-config); these are the
// optional methods layered on top. A tiny fixed set, so core methods live
// here rather than in a self-describing registry; runtimes contribute their
// own (e.g. Cloudflare Access) via their scaffold block.
export const CORE_AUTH_METHODS: readonly AuthMethodDescriptor[] = [
  {
    id: "oauth",
    label: "OAuth (GitHub)",
    description: "Sign in with a GitHub OAuth app",
    comment:
      "Register a GitHub OAuth app, put its secrets in .dev.vars, and add google/custom providers alongside github.",
    imports: ['import { github } from "plumix";'],
    authEntry:
      "oauth: { providers: { github: github((env) => ({ clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET })) } }",
    envVars: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
  },
  {
    id: "magic-link",
    label: "Magic link (email)",
    description: "Passwordless email sign-in links",
    comment:
      "consoleMailer logs the link in dev — swap for a real mailer (Resend/Postmark/…) and its key before production.",
    imports: ['import { consoleMailer } from "plumix";'],
    authEntry: 'magicLink: { siteName: "__PROJECT_NAME__" }',
    configSlots: { mailer: "consoleMailer()" },
  },
];

/** Auth methods offered for a runtime: the core set plus its own additions. */
export function availableAuthMethods(
  runtime: RuntimeDescriptor,
): AuthMethodDescriptor[] {
  const contributed = Object.entries(runtime.authMethods ?? {}).map(
    ([id, method]) => ({ id, ...method }),
  );
  return [...CORE_AUTH_METHODS, ...contributed];
}

/** Resolve selected auth-method ids to descriptors, deduped. */
export function resolveAuthMethods(
  ids: readonly string[],
  runtime: RuntimeDescriptor,
): AuthMethodDescriptor[] {
  const available = availableAuthMethods(runtime);
  return [...new Set(ids)].map((id) => {
    const method = available.find((m) => m.id === id);
    if (!method) {
      throw ScaffoldError.unknownAuthMethod({
        method: id,
        available: available.map((m) => m.id),
      });
    }
    return method;
  });
}
