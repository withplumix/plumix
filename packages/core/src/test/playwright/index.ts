import type { Page, Route } from "@playwright/test";

import type { PlumixManifest } from "../../plugin/manifest.js";
import type { AuthSessionOutput } from "../../rpc/procedures/auth/schemas.js";
import { emptyManifest } from "../../plugin/manifest.js";

export type { BuildAdminPluginChunkOptions } from "./build-admin-chunk.js";
export { buildAdminPluginChunkForE2E } from "./build-admin-chunk.js";
export type { PlumixE2EConfigOptions } from "./playwright-config.js";
export { definePlumixE2EConfig } from "./playwright-config.js";

/**
 * Playwright helpers for plugin authors testing their admin pages
 * against a running plumix site. Keep the surface small: mock RPC
 * endpoints, mock the admin manifest, mock auth session. Compose them
 * in your own `beforeEach` or fixtures.
 *
 * The plumix `webServer` setup (build + preview) is not provided here;
 * plugin authors point Playwright at their own `playground/` site that
 * registers their plugin via `plumix.config.ts`.
 */

export type MockRpcHandlers = Readonly<Record<string, unknown>>;

/**
 * oRPC's StandardRPCSerializer wire format — `{ json: <payload>, meta:
 * [] }`. Use when fulfilling a `page.route` handler manually rather than
 * via `mockRpc`. Empty meta is correct for payloads without BigInt /
 * Date / etc. transforms.
 */
export function rpcOkBody(payload: unknown): string {
  // `JSON.stringify(undefined)` drops the `json` key entirely, which
  // breaks the oRPC wire format. Coerce to null so the envelope is
  // always well-formed.
  return JSON.stringify({ json: payload ?? null, meta: [] });
}

/** As above but for an oRPC error envelope (`code`, `message`, `data`). */
export function rpcErrorBody(error: {
  readonly code: string;
  readonly message?: string;
  readonly data?: unknown;
}): string {
  return JSON.stringify({ json: error, meta: [] });
}

function rpcOk(route: Route, body: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: rpcOkBody(body),
  });
}

/**
 * Intercept `/_plumix/rpc/**` and answer matching procedure paths from
 * the supplied handler map. Handler keys match by URL suffix
 * (`"/auth/session"`, `"/media/list"`, etc). Unmatched paths return
 * 404 — surface gaps loudly rather than silently empty-respond.
 */
export async function mockRpc(
  page: Page,
  handlers: MockRpcHandlers,
): Promise<void> {
  await page.route("**/_plumix/rpc/**", (route) => {
    const url = route.request().url();
    for (const [suffix, body] of Object.entries(handlers)) {
      if (url.endsWith(suffix)) return rpcOk(route, body);
    }
    return route.fulfill({ status: 404, body: "not-mocked" });
  });
}

/**
 * Same as `mockRpc`, but pushes the parsed `json` payload of every
 * request whose URL ends in `captureSuffix` into an array that the
 * caller holds a reference to. Use to assert on the RPC input shape
 * a UI interaction produces (search box → /entry/list `search`,
 * column header click → `orderBy`, etc) without re-implementing the
 * page.route handler in every test.
 */
export async function mockRpcWithCapture(
  page: Page,
  options: {
    readonly captureSuffix: string;
    readonly captureResponse: unknown;
    readonly handlers: MockRpcHandlers;
  },
): Promise<readonly unknown[]> {
  const inputs: unknown[] = [];
  await page.route("**/_plumix/rpc/**", (route) => {
    const url = route.request().url();
    if (url.endsWith(options.captureSuffix)) {
      const body = route.request().postDataJSON() as { json?: unknown };
      inputs.push(body.json);
      return rpcOk(route, options.captureResponse);
    }
    for (const [suffix, body] of Object.entries(options.handlers)) {
      if (url.endsWith(suffix)) return rpcOk(route, body);
    }
    return route.fulfill({ status: 404, body: "not-mocked" });
  });
  return inputs;
}

export function mockSession(
  page: Page,
  body: AuthSessionOutput,
): Promise<void> {
  return mockRpc(page, { "/auth/session": body });
}

/**
 * Replace the inline manifest `<script>` tag in the admin's HTML with
 * a synthetic one. Use to register entry types, taxonomies, plugin
 * pages, etc. that your plugin needs at admin-load time.
 */
export async function mockManifest(
  page: Page,
  manifest: PlumixManifest,
): Promise<void> {
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const html = await response.text();
    // Escape every sequence the HTML parser would treat as
    // script-tag-end inside `<script type="application/json">`:
    // `</...` (close tags) and `<!--`/`-->` (comment boundaries).
    const payload = JSON.stringify(manifest)
      .replaceAll("</", "<\\/")
      .replaceAll("<!--", "<\\!--")
      .replaceAll("-->", "--\\>");
    const next = html.replace(
      /<script id="plumix-manifest"[^>]*>[\s\S]*?<\/script>/i,
      `<script id="plumix-manifest" type="application/json">${payload}</script>`,
    );
    await route.fulfill({
      response,
      body: next,
      headers: { ...response.headers(), "content-length": String(next.length) },
    });
  });
}

export { emptyManifest };

/**
 * Convenience for the "no user signed in" session shape — bootstrap
 * (first-admin flow) when `needsBootstrap` is true, login screen
 * otherwise.
 */
export function anonymousSession(needsBootstrap = false): AuthSessionOutput {
  return { user: null, needsBootstrap };
}

/**
 * Returns a copy of `session` with extra capabilities appended to the
 * user. Throws if `session.user` is null — adding capabilities to a
 * logged-out session is almost certainly a test bug.
 */
export function withCapabilities(
  session: AuthSessionOutput,
  ...capabilities: readonly string[]
): AuthSessionOutput {
  if (!session.user) {
    throw new Error(
      "withCapabilities: cannot add capabilities to an anonymous session " +
        "(session.user is null). Pass an authenticated session like AUTHED_ADMIN.",
    );
  }
  return {
    ...session,
    user: {
      ...session.user,
      capabilities: [...session.user.capabilities, ...capabilities],
    },
  };
}

export const AUTHED_ADMIN: AuthSessionOutput = {
  user: {
    id: 1,
    email: "admin@example.test",
    name: "Admin",
    avatarUrl: null,
    role: "admin",
    capabilities: [
      "settings:manage",
      "plugin:manage",
      "entry:post:create",
      "entry:post:delete",
      "entry:post:edit_any",
      "entry:post:edit_own",
      "entry:post:publish",
      "entry:post:read",
      "user:create",
      "user:delete",
      "user:edit",
      "user:edit_own",
      "user:list",
      "user:promote",
    ],
  },
  needsBootstrap: false,
};
