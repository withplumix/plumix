import { afterEach, describe, expect, test, vi } from "vitest";

import {
  magicLinkEmailError,
  MagicLinkRequestError,
  magicLinkRequestErrorDescriptor,
  requestMagicLink,
} from "./magic-link.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestMagicLink", () => {
  test("a response the server doesn't explain rejects as a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("not found", { status: 404 }))),
    );

    await expect(requestMagicLink("jane@example.com")).rejects.toMatchObject({
      code: "network",
    });
  });
});

describe("magicLinkRequestErrorDescriptor", () => {
  test("a network failure shows the retry copy", () => {
    expect(
      magicLinkRequestErrorDescriptor(MagicLinkRequestError.network()).message,
    ).toBe("Couldn't send the link. Try again.");
  });

  test("a failure that isn't a link-request error shows the retry copy", () => {
    expect(
      magicLinkRequestErrorDescriptor(new TypeError("Failed to fetch")).message,
    ).toBe("Couldn't send the link. Try again.");
  });
});

describe("magicLinkEmailError", () => {
  test.each(["", "   "])("asks for an email first when given %j", (email) => {
    expect(magicLinkEmailError(email)?.message).toBe(
      "Enter your email above first.",
    );
  });

  test("lets a typed email through", () => {
    expect(magicLinkEmailError("jane@example.com")).toBeNull();
  });
});
