import { describe, expect, it } from "vitest";

import {
  cacheBypassReason,
  requestIsPrivileged,
  responseIsStorable,
} from "./decision.js";

describe("cacheBypassReason", () => {
  it("caches an anonymous GET to a public entry permalink", () => {
    expect(
      cacheBypassReason({
        method: "GET",
        isPrivileged: false,
        intentKind: "single",
      }),
    ).toBe(null);
  });

  it("caches anonymous GETs to archive, taxonomy, and front-page intents", () => {
    for (const intentKind of ["archive", "taxonomy", "front-page"] as const) {
      expect(
        cacheBypassReason({ method: "GET", isPrivileged: false, intentKind }),
      ).toBe(null);
    }
  });

  it("bypasses a privileged request", () => {
    expect(
      cacheBypassReason({
        method: "GET",
        isPrivileged: true,
        intentKind: "single",
      }),
    ).toBe("privileged");
  });

  it("bypasses search pages", () => {
    expect(
      cacheBypassReason({
        method: "GET",
        isPrivileged: false,
        intentKind: "search",
      }),
    ).toBe("intent");
  });

  it("bypasses non-GET/HEAD methods", () => {
    expect(
      cacheBypassReason({
        method: "POST",
        isPrivileged: false,
        intentKind: "single",
      }),
    ).toBe("method");
  });
});

describe("requestIsPrivileged", () => {
  it("treats a plain anonymous GET as not privileged", () => {
    expect(requestIsPrivileged(new Request("https://site.test/post"))).toBe(
      false,
    );
  });

  it("treats a session-cookie request as privileged", () => {
    expect(
      requestIsPrivileged(
        new Request("https://site.test/post", {
          headers: { cookie: "plumix_session=abc" },
        }),
      ),
    ).toBe(true);
  });

  it("treats a request with an Authorization header as privileged", () => {
    expect(
      requestIsPrivileged(
        new Request("https://site.test/post", {
          headers: { authorization: "Bearer pl_pat_x" },
        }),
      ),
    ).toBe(true);
  });

  it("treats a ?preview= draft-grant request as privileged", () => {
    expect(
      requestIsPrivileged(new Request("https://site.test/post?preview=tok")),
    ).toBe(true);
  });
});

describe("responseIsStorable", () => {
  it("stores a 200 GET response", () => {
    expect(responseIsStorable("GET", 200)).toBe(true);
  });

  it("does not store non-200 responses", () => {
    expect(responseIsStorable("GET", 404)).toBe(false);
    expect(responseIsStorable("GET", 500)).toBe(false);
    expect(responseIsStorable("GET", 301)).toBe(false);
  });

  it("does not store HEAD responses (the Cache API only persists GET)", () => {
    expect(responseIsStorable("HEAD", 200)).toBe(false);
  });
});
