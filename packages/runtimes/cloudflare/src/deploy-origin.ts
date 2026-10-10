export interface DeployOriginInput {
  /** `name` field from your `wrangler.jsonc` / `wrangler.toml`. */
  readonly workerName: string;
  /**
   * Your `<account>.workers.dev` subdomain — the part before `.workers.dev`.
   */
  readonly accountSubdomain: string;
  /** Repo's default branch. Defaults to `"main"`. */
  readonly defaultBranch?: string;
  /** Override for local dev. Defaults to `http://localhost:8787`. */
  readonly localOrigin?: string;
  /**
   * Required on a custom production domain: Workers Builds doesn't expose it.
   * Previews stay on `*.workers.dev`, so no single passkey spans both.
   */
  readonly productionOrigin?: string;
}

export interface DeployOrigin {
  /** WebAuthn relying-party id — bare hostname, no scheme/port. */
  readonly rpId: string;
  /** Full origin string the browser sends for this deploy. */
  readonly origin: string;
  /**
   * The account wildcard on `*.workers.dev`, so one passkey spans production
   * and every preview.
   */
  readonly allowedOrigins?: readonly string[];
}

/**
 * Read as the literal `process.env.WORKERS_CI*` expressions: Vite's `define`
 * rewrites only those spellings, so an alias or helper falls back to localhost.
 */
declare const process: { env: Record<string, string | undefined> };

/**
 * With a custom production domain, previews stay on `*.workers.dev`, so
 * authenticate them with an origin-agnostic method. Falls back to localhost
 * outside Workers Builds.
 */
export function cloudflareDeployOrigin(input: DeployOriginInput): DeployOrigin {
  const localOrigin = input.localOrigin ?? "http://localhost:8787";
  if (process.env.WORKERS_CI !== "1") {
    return { rpId: "localhost", origin: localOrigin };
  }
  const defaultBranch = input.defaultBranch ?? "main";
  // Missing on some first deploys and redeploys; treated as the default branch,
  // since localhost would fail every deployed request.
  const raw = (process.env.WORKERS_CI_BRANCH ?? "").trim();
  const branch = raw === "" ? defaultBranch : raw;
  const isProduction = branch === defaultBranch;

  // Workers Builds can't tell us the custom host, so the operator declares it.
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

/**
 * Approximates Cloudflare's undocumented branch slug. Hand-rolled because a
 * regex dash trim trips CodeQL's `js/polynomial-redos`.
 */
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
