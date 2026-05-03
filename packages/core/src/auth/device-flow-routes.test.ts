import { describe, expect, test } from "vitest";

import { deviceCodes } from "../db/schema/device_codes.js";
import { createDispatcherHarness, plumixRequest } from "../test/dispatcher.js";
import { API_TOKEN_PREFIX } from "./api-tokens.js";

const DEVICE_CODE_PATH = "/_plumix/auth/device/code";
const DEVICE_TOKEN_PATH = "/_plumix/auth/device/token";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

describe("POST /_plumix/auth/device/code", () => {
  test("returns the RFC 8628 fields for a fresh session", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest(DEVICE_CODE_PATH, { method: "POST" }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(typeof body.device_code).toBe("string");
    expect(body.user_code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(typeof body.verification_uri).toBe("string");
    expect(body.verification_uri_complete).toBe(
      `${body.verification_uri as string}?user_code=${encodeURIComponent(body.user_code as string)}`,
    );
    expect(body.expires_in).toBeGreaterThan(0);
    expect(body.interval).toBeGreaterThan(0);
  });

  test("rejects POSTs without the X-Plumix-Request CSRF header", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      new Request(`https://cms.example${DEVICE_CODE_PATH}`, { method: "POST" }),
    );
    expect(response.status).toBe(403);
  });
});

describe("POST /_plumix/auth/device/token", () => {
  test("returns authorization_pending while the row is unapproved", async () => {
    const h = await createDispatcherHarness();
    const startResponse = await h.dispatch(
      plumixRequest(DEVICE_CODE_PATH, { method: "POST" }),
    );
    const { device_code } = (await startResponse.json()) as {
      device_code: string;
    };

    const response = await h.dispatch(
      plumixRequest(DEVICE_TOKEN_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant_type: DEVICE_GRANT, device_code }),
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("authorization_pending");
  });

  test("returns invalid_grant for an unknown device_code", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest(DEVICE_TOKEN_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: DEVICE_GRANT,
          device_code: "not-a-real-code",
        }),
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_grant");
  });

  test("returns invalid_request when grant_type is missing", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest(DEVICE_TOKEN_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ device_code: "anything" }),
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  test("returns invalid_request when grant_type is the wrong literal", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest(DEVICE_TOKEN_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          device_code: "anything",
        }),
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  test("returns invalid_request on malformed JSON body", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest(DEVICE_TOKEN_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      }),
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_request");
  });

  test("returns access_token + Bearer type on a successful exchange", async () => {
    const h = await createDispatcherHarness();
    const seeded = await h.factory.user.create({});

    // Start a device-flow session, then directly approve the row in
    // the DB to skip the browser-side approve UI.
    const startResponse = await h.dispatch(
      plumixRequest(DEVICE_CODE_PATH, { method: "POST" }),
    );
    const { device_code } = (await startResponse.json()) as {
      device_code: string;
    };
    await h.db
      .update(deviceCodes)
      .set({ status: "approved", userId: seeded.id, tokenName: "ci" });

    const response = await h.dispatch(
      plumixRequest(DEVICE_TOKEN_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant_type: DEVICE_GRANT, device_code }),
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.token_type).toBe("Bearer");
    expect(typeof body.access_token).toBe("string");
    expect((body.access_token as string).startsWith(API_TOKEN_PREFIX)).toBe(
      true,
    );

    // Row was consumed — second exchange surfaces invalid_grant.
    const second = await h.dispatch(
      plumixRequest(DEVICE_TOKEN_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant_type: DEVICE_GRANT, device_code }),
      }),
    );
    expect(second.status).toBe(400);
    expect((await second.json()) as { error: string }).toMatchObject({
      error: "invalid_grant",
    });
  });

  test("returns access_denied + consumes the row for a denied session", async () => {
    const h = await createDispatcherHarness();

    const startResponse = await h.dispatch(
      plumixRequest(DEVICE_CODE_PATH, { method: "POST" }),
    );
    const { device_code } = (await startResponse.json()) as {
      device_code: string;
    };
    await h.db.update(deviceCodes).set({ status: "denied" });

    const response = await h.dispatch(
      plumixRequest(DEVICE_TOKEN_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant_type: DEVICE_GRANT, device_code }),
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: "access_denied",
    });
    // Row was consumed — second exchange is invalid_grant, not
    // access_denied (no replay-discovery of the deny outcome).
    const second = await h.dispatch(
      plumixRequest(DEVICE_TOKEN_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant_type: DEVICE_GRANT, device_code }),
      }),
    );
    expect((await second.json()) as { error: string }).toMatchObject({
      error: "invalid_grant",
    });
  });

  test("returns expired_token + reaps the row past TTL", async () => {
    const h = await createDispatcherHarness();

    const startResponse = await h.dispatch(
      plumixRequest(DEVICE_CODE_PATH, { method: "POST" }),
    );
    const { device_code } = (await startResponse.json()) as {
      device_code: string;
    };
    await h.db
      .update(deviceCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    const response = await h.dispatch(
      plumixRequest(DEVICE_TOKEN_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant_type: DEVICE_GRANT, device_code }),
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: "expired_token",
    });
    const remaining = await h.db.select().from(deviceCodes);
    expect(remaining).toHaveLength(0);
  });

  test("validates body shape: device_code length capped", async () => {
    const h = await createDispatcherHarness();
    const oversized = "x".repeat(257);
    const response = await h.dispatch(
      plumixRequest(DEVICE_TOKEN_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grant_type: DEVICE_GRANT,
          device_code: oversized,
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: "invalid_request",
    });
  });
});
