import { CliError } from "./errors.js";

const ACCESS_LOGIN_HOST_SUFFIX = ".cloudflareaccess.com";

/**
 * Never follows a redirect: a followed Access login answers 200 with HTML.
 *
 * @throws CliError `remote_behind_access` when Access redirects to its login.
 */
export async function remoteFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    headers: withAccessServiceToken(init?.headers),
    redirect: "manual",
  });
  if (redirectsToAccessLogin(response, input)) {
    throw CliError.remoteBehindAccess({ url: new URL(input).origin });
  }
  return response;
}

function withAccessServiceToken(init: HeadersInit | undefined): Headers {
  const headers = new Headers(init);
  /* eslint-disable turbo/no-undeclared-env-vars -- the CLI reads these when it calls a deployed site, not during any turbo task */
  const id = process.env.CF_ACCESS_CLIENT_ID;
  const secret = process.env.CF_ACCESS_CLIENT_SECRET;
  /* eslint-enable turbo/no-undeclared-env-vars */
  if (id && secret) {
    headers.set("cf-access-client-id", id);
    headers.set("cf-access-client-secret", secret);
  }
  return headers;
}

function redirectsToAccessLogin(response: Response, input: string): boolean {
  if (response.status < 300 || response.status > 399) return false;
  const location = response.headers.get("location");
  if (location === null) return false;
  return new URL(location, input).hostname.endsWith(ACCESS_LOGIN_HOST_SUFFIX);
}
