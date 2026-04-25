export interface DeployOriginInput {
  /** `name` field from your `wrangler.jsonc` / `wrangler.toml`. */
  readonly workerName: string;
  /** Your `<account>.workers.dev` subdomain — the part before `.workers.dev`. */
  readonly accountSubdomain: string;
  /** Repo's default branch. Defaults to `"main"`. */
  readonly defaultBranch?: string;
  /** Override for local dev. Defaults to `http://localhost:8787`. */
  readonly localOrigin?: string;
}

export interface DeployOrigin {
  /** WebAuthn relying-party id — bare hostname, no scheme/port. */
  readonly rpId: string;
  /** Full origin string the browser sends. */
  readonly origin: string;
}

/**
 * Resolve the passkey rpId / origin for a Cloudflare Workers deploy by
 * reading the build-time env Workers Builds injects (`WORKERS_CI`,
 * `WORKERS_CI_BRANCH`). Returns the bare worker URL on the default
 * branch, the auto-generated `<branch>-<worker>.<account>.workers.dev`
 * URL on every other branch, and a localhost fallback when not running
 * under Workers Builds (i.e. local `pnpm dev`).
 *
 * Preview-deploy passkeys are scoped to that preview's hostname — a
 * passkey enrolled on PR #76 won't work on PR #77; that's WebAuthn's
 * domain-binding behavior, not a plumix limit. Use a custom domain +
 * wildcard subdomains if you need credentials to follow across
 * previews.
 */
export function cloudflareDeployOrigin(input: DeployOriginInput): DeployOrigin {
  const localOrigin = input.localOrigin ?? "http://localhost:8787";
  if (process.env.WORKERS_CI !== "1") {
    return { rpId: "localhost", origin: localOrigin };
  }
  const defaultBranch = input.defaultBranch ?? "main";
  // WORKERS_CI_BRANCH is set on push-triggered builds; on the very
  // first deploy or some redeploy paths it can be missing. Treating
  // an empty value as "the default branch" keeps production CSRF
  // working instead of falling back to localhost (which would fail
  // every deployed request).
  const raw = (process.env.WORKERS_CI_BRANCH ?? "").trim();
  const branch = raw === "" ? defaultBranch : raw;
  const isProduction = branch === defaultBranch;
  const host = isProduction
    ? `${input.workerName}.${input.accountSubdomain}.workers.dev`
    : `${sanitizeBranch(branch)}-${input.workerName}.${input.accountSubdomain}.workers.dev`;
  return { rpId: host, origin: `https://${host}` };
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
