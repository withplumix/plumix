import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { API_TOKEN_PREFIX } from "../../src/auth/api-tokens.js";
import { deviceCodes } from "../../src/db/schema/device_codes.js";
import { testSite } from "../../src/test/site.js";

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const ADMIN_MOUNT = "/_plumix/admin";

const site = await testSite({ plugins: [] });

function startDeviceSignIn(): ReturnType<typeof site.visit> {
  return site.visit("/_plumix/auth/device/code", { method: "POST" });
}

function exchange(body: string): ReturnType<typeof site.visit> {
  return site.visit("/_plumix/auth/device/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function exchangeCode(deviceCode: string): ReturnType<typeof site.visit> {
  return exchange(
    JSON.stringify({ grant_type: DEVICE_GRANT, device_code: deviceCode }),
  );
}

describe("starting a device sign-in", () => {
  test("answers the RFC 8628 fields", async () => {
    const page = await startDeviceSignIn();

    page.assertOk();
    const body = JSON.parse(page.body) as Record<string, unknown>;
    expect(typeof body.device_code).toBe("string");
    expect(body.user_code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(typeof body.verification_uri).toBe("string");
    expect(body.verification_uri_complete).toBe(
      `${body.verification_uri as string}?user_code=${encodeURIComponent(body.user_code as string)}`,
    );
    expect(body.expires_in).toBeGreaterThan(0);
    expect(body.interval).toBeGreaterThan(0);
  });

  test("points the verification uri at a page the admin router declares", async () => {
    const page = await startDeviceSignIn();

    const body = JSON.parse(page.body) as { verification_uri: string };
    const { pathname } = new URL(body.verification_uri);
    expect(pathname.startsWith(`${ADMIN_MOUNT}/`)).toBe(true);
    const routeTree = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../admin/src/routeTree.gen.ts",
      ),
      "utf8",
    );
    const fullPaths = /interface FileRoutesByFullPath \{([^}]*)\}/.exec(
      routeTree,
    )?.[1];
    expect(fullPaths).toContain(`"${pathname.slice(ADMIN_MOUNT.length)}":`);
  });

  test("refuses a POST whose CSRF header lacks its value", async () => {
    const page = await site.visit("/_plumix/auth/device/code", {
      method: "POST",
      headers: { "x-plumix-request": "0" },
    });

    page.assertForbidden();
  });
});

describe("exchanging a device code", () => {
  test("answers authorization_pending while the code is unapproved", async () => {
    const started = await startDeviceSignIn();
    const { device_code } = JSON.parse(started.body) as {
      device_code: string;
    };

    const page = await exchangeCode(device_code);

    expect(page.status).toBe(400);
    page.assertJson({ error: "authorization_pending" });
  });

  test("answers invalid_grant for an unknown code", async () => {
    const page = await exchangeCode("not-a-real-code");

    expect(page.status).toBe(400);
    page.assertJson({ error: "invalid_grant" });
  });

  test("answers invalid_request when grant_type is missing", async () => {
    const page = await exchange(JSON.stringify({ device_code: "anything" }));

    expect(page.status).toBe(400);
    page.assertJson({ error: "invalid_request" });
  });

  test("answers invalid_request when grant_type is the wrong literal", async () => {
    const page = await exchange(
      JSON.stringify({
        grant_type: "authorization_code",
        device_code: "anything",
      }),
    );

    expect(page.status).toBe(400);
    page.assertJson({ error: "invalid_request" });
  });

  test("answers invalid_request for a malformed JSON body", async () => {
    const page = await exchange("{not-json");

    expect(page.status).toBe(400);
    page.assertJson({ error: "invalid_request" });
  });

  test("answers invalid_request for a device code over the length cap", async () => {
    const page = await exchangeCode("x".repeat(257));

    expect(page.status).toBe(400);
    page.assertJson({ error: "invalid_request" });
  });

  test("answers a Bearer api token for an approved code", async () => {
    const user = await site.factory.user.create();
    const { deviceCode } = await site.factory.deviceCode.create({
      status: "approved",
      userId: user.id,
      tokenName: "ci",
    });

    const page = await exchangeCode(deviceCode);

    page.assertOk().assertJson({ token_type: "Bearer" });
    const { access_token } = JSON.parse(page.body) as {
      access_token: string;
    };
    expect(access_token.startsWith(API_TOKEN_PREFIX)).toBe(true);
  });

  test("answers invalid_grant for an approved code already exchanged", async () => {
    const user = await site.factory.user.create();
    const { deviceCode } = await site.factory.deviceCode.create({
      status: "approved",
      userId: user.id,
      tokenName: "ci",
    });
    await exchangeCode(deviceCode);

    const page = await exchangeCode(deviceCode);

    expect(page.status).toBe(400);
    page.assertJson({ error: "invalid_grant" });
  });

  test("answers access_denied for a denied code", async () => {
    const { deviceCode } = await site.factory.deviceCode.create({
      status: "denied",
    });

    const page = await exchangeCode(deviceCode);

    expect(page.status).toBe(400);
    page.assertJson({ error: "access_denied" });
  });

  // No replay discovers the deny outcome.
  test("answers invalid_grant for a denied code already exchanged", async () => {
    const { deviceCode } = await site.factory.deviceCode.create({
      status: "denied",
    });
    await exchangeCode(deviceCode);

    const page = await exchangeCode(deviceCode);

    page.assertJson({ error: "invalid_grant" });
  });

  test("answers expired_token for a code past its lifetime", async () => {
    const { deviceCode } = await site.factory.deviceCode.create();
    site.travel({ minutes: 11 });

    const page = await exchangeCode(deviceCode);

    expect(page.status).toBe(400);
    page.assertJson({ error: "expired_token" });
  });

  test("removes a code past its lifetime once it is presented", async () => {
    const { deviceCode } = await site.factory.deviceCode.create();
    site.travel({ minutes: 11 });

    await exchangeCode(deviceCode);

    const remaining = await site.context.db.select().from(deviceCodes);
    expect(remaining).toEqual([]);
  });
});
