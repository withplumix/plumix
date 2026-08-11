export interface DeployOriginInput {
  /** `name` field from your `wrangler.jsonc` / `wrangler.toml`. */
  readonly workerName: string;
  /** Your `<account>.workers.dev` subdomain — the part before `.workers.dev`. */
  readonly accountSubdomain: string;
  /** Repo's default branch. Defaults to `"main"`. */
  readonly defaultBranch?: string;
  /** Override for local dev. Defaults to `http://localhost:8787`. */
  readonly localOrigin?: string;
  /**
   * Full origin of the custom domain the *production* deploy is served on
   * (e.g. `"https://example.com"`). Set this whenever production runs on a
   * custom domain rather than its `*.workers.dev` host — Workers Builds does
   * not expose the custom domain, so it can't be inferred. When set, the
   * production branch resolves `rpId`/`origin` from it (deriving `rpId` from
   * its hostname). Preview branches are unaffected: they stay on their
   * per-branch `*.workers.dev` host (a custom domain and `workers.dev` are
   * different registrable domains, so no single passkey can span both).
   */
  readonly productionOrigin?: string;
}

export interface DeployOrigin {
  /** WebAuthn relying-party id — bare hostname, no scheme/port. */
  readonly rpId: string;
  /** Full origin string the browser sends for this deploy. */
  readonly origin: string;
  /**
   * Extra origins the passkey ceremony accepts alongside `origin`. On a
   * `*.workers.dev` deploy this is the account wildcard
   * (`https://*.<account>.workers.dev`) so one passkey — anchored to the
   * account-subdomain `rpId` — spans production and every per-branch preview.
   * Omitted for the localhost fallback and the custom-domain production case.
   */
  readonly allowedOrigins?: readonly string[];
}

/**
 * Resolve the passkey `rpId` / `origin` / `allowedOrigins` for a Cloudflare
 * Workers deploy from the build-time env Workers Builds injects (`WORKERS_CI`,
 * `WORKERS_CI_BRANCH`).
 *
 * On any `*.workers.dev` deploy — production or a per-branch preview — `rpId`
 * is the account registrable domain (`<account>.workers.dev`) and
 * `allowedOrigins` is the account wildcard (`https://*.<account>.workers.dev`).
 * Because every deploy shares that registrable domain, one passkey enrolled
 * once is valid on production *and* every preview branch (previews are all
 * subdomains of the same `<account>.workers.dev`). `origin` still reflects the
 * specific host this build is served on.
 *
 * When production runs on a custom domain, pass `productionOrigin` — Workers
 * Builds does not expose the custom domain, so it can't be inferred. The
 * production branch then anchors to it; preview branches stay on their
 * `*.workers.dev` host. A custom domain and `workers.dev` are different
 * registrable domains, so no single passkey spans both — authenticate previews
 * with an origin-agnostic method (magic-link / Cloudflare Access) in that case.
 *
 * Falls back to localhost when not running under Workers Builds (local dev).
 */
export function cloudflareDeployOrigin(input: DeployOriginInput): DeployOrigin {
  // @cloudflare/workers-types declares a global `process: any` that shadows
  // @types/node's typed global (both are in this package's tsconfig `types`),
  // so read the build-time Workers Builds env through a typed view.
  const env = readEnv();
  const localOrigin = input.localOrigin ?? "http://localhost:8787";
  if (env.WORKERS_CI !== "1") {
    return { rpId: "localhost", origin: localOrigin };
  }
  const defaultBranch = input.defaultBranch ?? "main";
  // WORKERS_CI_BRANCH is set on push-triggered builds; on the very
  // first deploy or some redeploy paths it can be missing. Treating
  // an empty value as "the default branch" keeps production CSRF
  // working instead of falling back to localhost (which would fail
  // every deployed request).
  const raw = (env.WORKERS_CI_BRANCH ?? "").trim();
  const branch = raw === "" ? defaultBranch : raw;
  const isProduction = branch === defaultBranch;

  // Custom-domain production: Workers Builds can't tell us the host, so the
  // operator declares it. rpId derives from its hostname; previews keep their
  // workers.dev host below (different registrable domain — can't be spanned).
  if (isProduction && input.productionOrigin !== undefined) {
    const url = new URL(input.productionOrigin);
    return { rpId: url.hostname, origin: url.origin };
  }

  const accountDomain = `${input.accountSubdomain}.workers.dev`;
  const host = isProduction
    ? `${input.workerName}.${accountDomain}`
    : `${sanitizeBranch(branch)}-${input.workerName}.${accountDomain}`;
  // rpId is the account *registrable* domain, and the wildcard accepts every
  // host under it — so a passkey enrolled once is valid on production and on
  // every per-branch preview `*.workers.dev` URL.
  return {
    rpId: accountDomain,
    origin: `https://${host}`,
    allowedOrigins: [`https://*.${accountDomain}`],
  };
}

function readEnv(): Record<string, string | undefined> {
  return (process as { env: Record<string, string | undefined> }).env;
}

// Cloudflare lowercases branch names and replaces non-alphanumerics
// with `-`. We don't have an authoritative algorithm to mirror, so this
// covers the cases the user is likely to push (slashes from feat/x,
// underscores from snake_case, etc.) and lines up with the URLs
// Workers Builds generates in practice.
//
// Hand-rolled single-pass to dodge CodeQL's `js/polynomial-redos` —
// the `replace(/^-+|-+$/g, "")` trim is technically polynomial when
// fed pathological dash runs, even though the upstream input is a
// short branch name.
function sanitizeBranch(branch: string): string {
  let result = "";
  let pendingDash = false;
  for (let i = 0; i < branch.length; i++) {
    const c = branch.charCodeAt(i);
    const lower = c >= 65 && c <= 90 ? c + 32 : c; // ASCII upper → lower
    const isAlphaNum =
      (lower >= 97 && lower <= 122) || (lower >= 48 && lower <= 57);
    if (isAlphaNum) {
      if (pendingDash && result.length > 0) result += "-";
      result += String.fromCharCode(lower);
      pendingDash = false;
    } else {
      pendingDash = true;
    }
  }
  return result;
}
