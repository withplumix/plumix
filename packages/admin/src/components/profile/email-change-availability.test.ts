import { describe, expect, test } from "vitest";

import { emailChangeAvailability } from "./email-change-availability.js";

describe("emailChangeAvailability", () => {
  test("an editor on a site with magic-link sign-in is offered the change", () => {
    expect(emailChangeAvailability({ canEdit: true, magicLink: true })).toBe(
      "offer",
    );
  });

  test("an editor on a site without magic-link sign-in is told why the email can't change", () => {
    expect(emailChangeAvailability({ canEdit: true, magicLink: false })).toBe(
      "unavailable",
    );
  });

  test("nothing shows while the sign-in methods load", () => {
    expect(
      emailChangeAvailability({ canEdit: true, magicLink: undefined }),
    ).toBe("hidden");
  });

  test("a viewer who can't edit the email sees neither the offer nor the reason", () => {
    expect(emailChangeAvailability({ canEdit: false, magicLink: false })).toBe(
      "hidden",
    );
  });
});
