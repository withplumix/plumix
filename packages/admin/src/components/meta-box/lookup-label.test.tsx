import { describe, expect, test } from "vitest";

import { renderWithI18n } from "../../../test/render-with-i18n.js";
import { LookupLabel } from "./lookup-label.js";

// Public-API contract for the label-or-fallback display used by both
// reference pickers. `null` is the wire signal from the server-side
// lookup adapter that the row had no human-authored label — the
// admin substitutes a localized "Untitled" descriptor at render time
// rather than persist English source strings into entry meta.

describe("LookupLabel", () => {
  test("renders the raw string when value is non-null", () => {
    const { getByTestId } = renderWithI18n(
      <span data-testid="lookup-label-string">
        <LookupLabel value="My post" />
      </span>,
    );
    expect(getByTestId("lookup-label-string").textContent).toBe("My post");
  });

  test("renders the localized 'Untitled' descriptor when value is null", () => {
    const { getByTestId } = renderWithI18n(
      <span data-testid="lookup-label-null">
        <LookupLabel value={null} />
      </span>,
    );
    expect(getByTestId("lookup-label-null").textContent).toMatch(/untitled/i);
  });
});
