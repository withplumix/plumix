import * as v from "valibot";

import type { CliError } from "@plumix/core/cli";

import { syncDeps } from "./commands/sync.js";
import { PlumixCliError } from "./errors.js";
import { report } from "./report.js";

/**
 * Mutable seam for tests — substitute the collaborator, not the module path.
 */
export const remoteDeps = {
  fetch: (url: string, init?: RequestInit): Promise<Response> =>
    fetch(url, init),
  sleep: (seconds: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, seconds * 1000)),
};

/** `path` under a site's origin, keeping any base path the origin carries. */
export function siteUrl(origin: string, path: string): string {
  const root = origin.endsWith("/") ? origin : `${origin}/`;
  return new URL(path, root).href;
}

interface ResolveApiTokenOptions {
  /** The deployed site's origin. */
  readonly url: string;
  /** The `--token` flag's value. */
  readonly token: string | undefined;
  /** The error for a run with no token and no terminal to authorize one in. */
  readonly missing: () => CliError;
}

/**
 * The API token a command calls a deployed site with: `--token`, else
 * `PLUMIX_API_TOKEN`, else, on a terminal, one the site's device flow mints.
 * Never stored.
 */
export async function resolveApiToken(
  options: ResolveApiTokenOptions,
): Promise<string> {
  if (options.token) return options.token;
  const fromEnv = process.env.PLUMIX_API_TOKEN;
  if (fromEnv) return fromEnv;
  if (!syncDeps.isInteractive()) throw options.missing();
  return authorizeDevice(options.url);
}

const DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

/** RFC 8628 §3.5: keep polling, five seconds slower. */
const SLOW_DOWN_SECONDS = 5;

const DeviceCodeBody = v.object({
  device_code: v.string(),
  user_code: v.string(),
  verification_uri_complete: v.string(),
  interval: v.number(),
});

const TokenBody = v.union([
  v.object({ access_token: v.string() }),
  v.object({ error: v.string() }),
]);

/** RFC 8628 against the site's own device endpoints. */
async function authorizeDevice(url: string): Promise<string> {
  const response = await postToSite(url, "_plumix/auth/device/code", {});
  const code = await readBody(response, DeviceCodeBody);
  if (!response.ok || code === undefined) {
    throw PlumixCliError.deviceAuthorizationFailed({
      detail: `the site answered ${String(response.status)} to a device code request`,
    });
  }
  const { device_code, user_code, verification_uri_complete } = code;
  report.info(
    `Open ${verification_uri_complete} and approve the code ${user_code} to let this command call the site.`,
  );
  let interval = code.interval;
  for (;;) {
    await remoteDeps.sleep(interval);
    const polled = await postToSite(url, "_plumix/auth/device/token", {
      grant_type: DEVICE_CODE_GRANT_TYPE,
      device_code,
    });
    const body = await readBody(polled, TokenBody);
    if (polled.ok && body !== undefined && "access_token" in body) {
      return body.access_token;
    }
    const error =
      body !== undefined && "error" in body ? body.error : undefined;
    if (error === "authorization_pending") continue;
    if (error === "slow_down") {
      interval += SLOW_DOWN_SECONDS;
      continue;
    }
    throw PlumixCliError.deviceAuthorizationFailed({
      detail: error ?? `the site answered ${String(polled.status)}`,
    });
  }
}

function postToSite(
  url: string,
  path: string,
  body: Readonly<Record<string, string>>,
): Promise<Response> {
  return remoteDeps.fetch(siteUrl(url, path), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // The site's CSRF gate admits a command-line client by this header.
      "x-plumix-request": "1",
    },
    body: JSON.stringify(body),
  });
}

async function readBody<TSchema extends v.GenericSchema>(
  response: Response,
  schema: TSchema,
): Promise<v.InferOutput<TSchema> | undefined> {
  try {
    const parsed = v.safeParse(schema, (await response.json()) as unknown);
    return parsed.success ? parsed.output : undefined;
  } catch {
    return undefined;
  }
}
