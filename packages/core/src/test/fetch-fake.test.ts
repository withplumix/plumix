import { describe, expect, test } from "vitest";

import { fakeFetch } from "./fetch-fake.js";

describe("a declared route", () => {
  test("answers a request to its method and URL", async () => {
    const fetch = fakeFetch();
    fetch.route("GET", "https://api.example/status", Response.json({ ok: 1 }));

    const response = await fetch.send("https://api.example/status");

    expect(await response.json()).toEqual({ ok: 1 });
  });

  test("matches a URL pattern, each * standing for any run of characters", async () => {
    const fetch = fakeFetch();
    fetch.route("GET", "https://api.example/users/*?fields=*", (request) =>
      Response.json({ url: request.url }),
    );

    const response = await fetch.send("https://api.example/users/7?fields=a.b");

    expect(await response.json()).toEqual({
      url: "https://api.example/users/7?fields=a.b",
    });
  });

  test("does not match a URL the pattern's literal parts do not cover", async () => {
    const fetch = fakeFetch();
    fetch.route("GET", "https://api.example/users/*?fields=*", new Response());

    await expect(
      fetch.send("https://api.example/users/7/posts"),
    ).rejects.toThrow("fetch: no route answers GET");
  });

  test("answers a URL declared without the path the request carries", async () => {
    const fetch = fakeFetch();
    fetch.route("GET", "https://api.example", new Response("up"));

    const response = await fetch.send("https://api.example");

    expect(await response.text()).toBe("up");
  });

  test("answers a URL declared as the request URL spells it", async () => {
    const fetch = fakeFetch();
    fetch.route("GET", "https://api.example/a b", new Response("up"));

    const response = await fetch.send("https://api.example/a b");

    expect(await response.text()).toBe("up");
  });

  test("answers each request afresh", async () => {
    const fetch = fakeFetch();
    fetch.route("GET", "https://api.example/", new Response("up"));

    await fetch.send("https://api.example/");
    const again = await fetch.send("https://api.example/");

    expect(await again.text()).toBe("up");
  });

  test("answers only its own method", async () => {
    const fetch = fakeFetch();
    fetch.route("POST", "https://api.example/", new Response("posted"));

    await expect(fetch.send("https://api.example/")).rejects.toThrow(
      "fetch: no route answers GET https://api.example/.",
    );
  });
});

describe("an undeclared request", () => {
  test("fails listing the declared routes", async () => {
    const fetch = fakeFetch();
    fetch.route("GET", "https://api.example/status", new Response("up"));
    fetch.route("post", "https://api.example/ping", new Response(null));

    await expect(fetch.send("https://api.example/ping")).rejects.toThrow(
      "fetch: no route answers GET https://api.example/ping. " +
        "Declare one with site.fetch.route(method, url, answer).\n" +
        "Declared routes:\n" +
        "  - GET https://api.example/status\n" +
        "  - POST https://api.example/ping",
    );
  });

  test("fails saying no route is declared", async () => {
    await expect(fakeFetch().send("https://api.example/")).rejects.toThrow(
      "fetch: no route answers GET https://api.example/. " +
        "Declare one with site.fetch.route(method, url, answer).\n" +
        "No route is declared.",
    );
  });
});

function pingRoute(): ReturnType<typeof fakeFetch> {
  const fetch = fakeFetch();
  fetch.route("*", "https://api.example/*", new Response(null));
  return fetch;
}

describe("assertFetched", () => {
  test("passes for a request to the URL", async () => {
    const fetch = pingRoute();
    await fetch.send("https://api.example/ping");

    expect(() => {
      fetch.assertFetched("https://api.example/ping");
    }).not.toThrow();
  });

  test("passes for a request with the method and JSON body", async () => {
    const fetch = pingRoute();
    await fetch.send("https://api.example/ping", {
      method: "POST",
      body: JSON.stringify({ urls: ["/a"], key: "k" }),
    });

    expect(() => {
      fetch.assertFetched("https://api.example/ping", {
        method: "post",
        body: { key: "k", urls: ["/a"] },
      });
    }).not.toThrow();
  });

  test("passes for a request with the text body", async () => {
    const fetch = pingRoute();
    await fetch.send("https://api.example/ping", {
      method: "PUT",
      body: "secret=abc",
    });

    expect(() => {
      fetch.assertFetched("https://api.example/ping", { body: "secret=abc" });
    }).not.toThrow();
  });

  test("fails listing what was fetched, bodies included", async () => {
    const fetch = pingRoute();
    await fetch.send("https://api.example/status");
    await fetch.send("https://api.example/ping", {
      method: "POST",
      body: '{"key":"other"}',
    });

    expect(() => {
      fetch.assertFetched("https://api.example/ping", {
        method: "POST",
        body: { key: "k" },
      });
    }).toThrow(
      'Expected POST https://api.example/ping with body {"key":"k"} to be fetched, but it was not.\n' +
        "Fetched:\n" +
        "  - GET https://api.example/status\n" +
        '  - POST https://api.example/ping {"key":"other"}',
    );
  });

  test("fails saying nothing was fetched", () => {
    expect(() => {
      pingRoute().assertFetched("https://api.example/ping");
    }).toThrow(
      "Expected https://api.example/ping to be fetched, but it was not.\n" +
        "Nothing was fetched.",
    );
  });
});

describe("assertNotFetched", () => {
  test("passes when no request matched the URL", async () => {
    const fetch = pingRoute();
    await fetch.send("https://api.example/status");

    expect(() => {
      fetch.assertNotFetched("https://api.example/ping");
    }).not.toThrow();
  });

  test("fails listing what was fetched", async () => {
    const fetch = pingRoute();
    await fetch.send("https://api.example/ping", { method: "DELETE" });

    expect(() => {
      fetch.assertNotFetched("https://api.example/*");
    }).toThrow(
      "Expected https://api.example/* not to be fetched, but it was 1 time.\n" +
        "Fetched:\n" +
        "  - DELETE https://api.example/ping",
    );
  });
});

describe("a route declared to time out", () => {
  test("refuses a call that lifts the bound, which would wait forever", async () => {
    const fetch = fakeFetch();
    fetch.route("GET", "https://download.example/*", "timeout");

    await expect(
      fetch.send("https://download.example/big", { timeout: false }),
    ).rejects.toThrow(
      "fetch: GET https://download.example/big is declared to time out, but the call passes { timeout: false }, so it would wait forever.",
    );
  });
});

describe("assertAllDeclared", () => {
  test("passes when every request had a route", async () => {
    const fetch = pingRoute();
    await fetch.send("https://api.example/ping");

    expect(() => {
      fetch.assertAllDeclared();
    }).not.toThrow();
  });

  test("throws the first undeclared request's error, though its caller caught it", async () => {
    const fetch = fakeFetch();
    await fetch.send("https://api.example/first").catch(() => undefined);
    await fetch.send("https://api.example/second").catch(() => undefined);

    expect(() => {
      fetch.assertAllDeclared();
    }).toThrow("fetch: no route answers GET https://api.example/first.");
  });
});
