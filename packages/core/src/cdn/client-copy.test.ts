import { describe, expect, it } from "vitest";

import { segmentClientCopy } from "./client-copy.js";

describe("segmentClientCopy", () => {
  it("adds cookie to a member page that varies on another header", () => {
    const page = new Response("page", {
      headers: { vary: "accept-language" },
    });

    const copy = segmentClientCopy(page, "authenticated");

    expect(copy.headers.get("vary")).toBe("accept-language, cookie");
  });

  it("names cookie once when the page already varies on it", () => {
    const page = new Response("page", {
      headers: { vary: "Accept-Language, Cookie" },
    });

    const copy = segmentClientCopy(page, "authenticated");

    expect(copy.headers.get("vary")).toBe("Accept-Language, Cookie");
  });
});
