import { describe, expect, test } from "vitest";

import { trustRequest } from "./request-trust.js";

// What a hostile client, or a trusted proxy, puts on a request.
const FORWARDED = {
  "x-forwarded-proto": "https",
  "x-forwarded-host": "cms.example",
  "x-forwarded-for": "203.0.113.9, 198.51.100.2",
};

const CONNECTION = {
  scheme: "http",
  port: 3000,
  remoteAddress: "127.0.0.1",
} as const;

describe("trustProxy off", () => {
  test("forged forwarding headers are ignored: the caller's scheme, the Host and the connection's address win", () => {
    const request = new Request("http://internal/p?q=1", {
      headers: { ...FORWARDED, host: "site.test:3000" },
    });

    const trusted = trustRequest(request, CONNECTION);

    expect(trusted.url.href).toBe("http://site.test:3000/p?q=1");
    expect(trusted.clientAddress).toBe("127.0.0.1");
  });
});

describe("trustProxy on", () => {
  test("the forwarded scheme, host and rightmost address are honoured", () => {
    const request = new Request("http://internal/p", {
      headers: { ...FORWARDED, host: "site.test:3000" },
    });

    const trusted = trustRequest(request, CONNECTION, { trustProxy: true });

    expect(trusted.url.href).toBe("https://cms.example/p");
    expect(trusted.clientAddress).toBe("198.51.100.2");
  });

  test("a header the proxy did not send falls back to the connection", () => {
    const request = new Request("http://internal/p", {
      headers: { host: "site.test:3000" },
    });

    const trusted = trustRequest(request, CONNECTION, { trustProxy: true });

    expect(trusted.url.href).toBe("http://site.test:3000/p");
    expect(trusted.clientAddress).toBe("127.0.0.1");
  });

  test("an empty trailing x-forwarded-for entry falls back to the connection's address", () => {
    const request = new Request("http://internal/", {
      headers: { "x-forwarded-for": "203.0.113.9, " },
    });

    const trusted = trustRequest(request, CONNECTION, { trustProxy: true });

    expect(trusted.clientAddress).toBe("127.0.0.1");
  });
});

describe("the effective URL", () => {
  test("carries the bound port when the request has no Host", () => {
    const request = new Request("http://internal/no-host");

    expect(trustRequest(request, CONNECTION).url.href).toBe(
      "http://localhost:3000/no-host",
    );
  });

  test("takes the caller's scheme, so an https listener yields an https URL", () => {
    const request = new Request("http://internal/p", {
      headers: { host: "site.test" },
    });

    expect(
      trustRequest(request, { ...CONNECTION, scheme: "https" }).url.href,
    ).toBe("https://site.test/p");
  });

  test("a protocol-relative path cannot rewrite the origin", () => {
    const url = new URL("http://internal");
    url.pathname = "//evil.example/p";
    const request = new Request(url, { headers: { host: "site.test" } });

    expect(trustRequest(request, CONNECTION).url.href).toBe(
      "http://site.test//evil.example/p",
    );
  });

  test("a Host a URL cannot carry throws", () => {
    const request = new Request("http://internal/", {
      headers: { host: "a b" },
    });

    expect(() => trustRequest(request, CONNECTION)).toThrow();
  });
});
