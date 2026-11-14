import { describe, expect, test } from "vitest";

import {
  forwardedByGateway,
  sharedCacheRequest,
  visitorRequest,
} from "./shared-cache.js";

function forwarded(url: string, init: RequestInit = {}): Request {
  return sharedCacheRequest(new Request(url, init));
}

describe("sharedCacheRequest", () => {
  test("removes every cookie", () => {
    const request = forwarded("https://site.example/", {
      headers: { cookie: "_ga=GA1.1.1; theme=dark", accept: "text/html" },
    });

    expect(request.headers.has("cookie")).toBe(false);
    expect(request.headers.get("accept")).toBe("text/html");
  });

  test.each(["utm_source=news", "utm_id=7", "gclid=abc", "msclkid=abc"])(
    "drops the marketing parameter %s",
    (parameter) => {
      expect(forwarded(`https://site.example/soup?${parameter}`).url).toBe(
        "https://site.example/soup",
      );
    },
  );

  test("keeps the other parameters, sorted", () => {
    expect(
      forwarded("https://site.example/search?q=soup&gclid=x&page=2&a=1").url,
    ).toBe("https://site.example/search?a=1&page=2&q=soup");
  });

  test("keeps the method and the path", () => {
    const request = forwarded("https://site.example/recipes/soup?b=2&a=1", {
      method: "HEAD",
    });

    expect(request.method).toBe("HEAD");
    expect(request.url).toBe("https://site.example/recipes/soup?a=1&b=2");
  });
});

describe("the gateway's internal header", () => {
  test("marks a request the gateway forwards", () => {
    expect(forwardedByGateway(forwarded("https://site.example/soup"))).toBe(
      true,
    );
  });

  test("is not on a request the gateway did not forward", () => {
    expect(forwardedByGateway(new Request("https://site.example/soup"))).toBe(
      false,
    );
  });

  test("is stripped from a visitor's request, so a client cannot forge it", () => {
    const forged = sharedCacheRequest(new Request("https://site.example/soup"));

    expect(forwardedByGateway(visitorRequest(forged))).toBe(false);
  });

  test("leaves the rest of a visitor's request as it arrived", () => {
    const request = visitorRequest(
      new Request("https://site.example/soup?utm_source=x", {
        method: "POST",
        headers: { cookie: "plumix_session=abc" },
        body: "form",
      }),
    );

    expect(request.url).toBe("https://site.example/soup?utm_source=x");
    expect(request.method).toBe("POST");
    expect(request.headers.get("cookie")).toBe("plumix_session=abc");
  });
});
