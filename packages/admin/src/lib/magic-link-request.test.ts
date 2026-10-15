import { describe, expect, test } from "vitest";

import {
  magicLinkEmailError,
  magicLinkRequestErrorDescriptor,
} from "./magic-link-request.js";

describe("magicLinkRequestErrorDescriptor", () => {
  test("a site without magic links shows the not-configured copy", () => {
    expect(
      magicLinkRequestErrorDescriptor("magic_link_not_configured").message,
    ).toBe("Magic-link sign-in isn't configured on this site.");
  });

  test("a rejected email shows the invalid-input copy", () => {
    expect(magicLinkRequestErrorDescriptor("invalid_input").message).toBe(
      "Enter a valid email address.",
    );
  });

  test.each(["network_error", "unknown", "rate_limited"])(
    "%s shows the retry copy",
    (code) => {
      expect(magicLinkRequestErrorDescriptor(code).message).toBe(
        "Couldn't send the link. Try again.",
      );
    },
  );
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
