import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { CoAuthorIndicator } from "./CoAuthorIndicator.js";

beforeEach(() => {
  i18n.load({ en: {} });
  i18n.activate("en");
});

afterEach(() => {
  cleanup();
});

function renderInProvider(node: React.ReactNode) {
  return render(<I18nProvider i18n={i18n}>{node}</I18nProvider>);
}

const T_NOW = new Date("2026-05-22T12:00:00Z");
const T_30S_AGO = new Date("2026-05-22T11:59:30Z");
const T_2M_AGO = new Date("2026-05-22T11:58:00Z");

describe("CoAuthorIndicator", () => {
  test("renders nothing when there are no co-authors (no visual noise)", () => {
    const { container } = renderInProvider(
      <CoAuthorIndicator users={[]} relativeTime={() => "now"} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("renders an avatar + count for a single co-author", () => {
    renderInProvider(
      <CoAuthorIndicator
        users={[
          {
            id: 7,
            name: "Ada Lovelace",
            email: "ada@example.test",
            lastSeenAt: T_30S_AGO,
          },
        ]}
        relativeTime={() => "30 seconds ago"}
      />,
    );
    const indicator = screen.getByTestId("coauthor-indicator");
    expect(indicator.textContent).toContain("Ada Lovelace");
    expect(indicator.textContent).toContain("30 seconds ago");
  });

  test("renders multiple co-authors with their individual last-seen labels", () => {
    renderInProvider(
      <CoAuthorIndicator
        users={[
          {
            id: 7,
            name: "Ada",
            email: "ada@example.test",
            lastSeenAt: T_30S_AGO,
          },
          {
            id: 8,
            name: null,
            email: "bea@example.test",
            lastSeenAt: T_2M_AGO,
          },
        ]}
        relativeTime={(d) =>
          d.getTime() === T_30S_AGO.getTime() ? "30s" : "2m"
        }
      />,
    );
    const indicator = screen.getByTestId("coauthor-indicator");
    expect(indicator.textContent).toContain("Ada");
    // Author without a name falls back to email so the user can still
    // tell who's editing.
    expect(indicator.textContent).toContain("bea@example.test");
    expect(indicator.textContent).toContain("30s");
    expect(indicator.textContent).toContain("2m");
  });

  test("each avatar carries an aria-label with identity + last-seen so screen readers get per-item context", () => {
    renderInProvider(
      <CoAuthorIndicator
        users={[
          {
            id: 7,
            name: "Ada Lovelace",
            email: "ada@example.test",
            lastSeenAt: T_30S_AGO,
          },
        ]}
        relativeTime={() => "30 seconds ago"}
      />,
    );
    // List-level aria-label gives screen-reader users a count cue
    // before they descend into the per-item identities.
    const list = screen.getByTestId("coauthor-indicator").querySelector("ul");
    expect(list?.getAttribute("aria-label")).toBe("Active co-authors");
    const avatar = screen
      .getByTestId("coauthor-avatar-fallback-7")
      .closest("[data-slot=avatar]");
    expect(avatar?.getAttribute("aria-label")).toContain("Ada Lovelace");
    expect(avatar?.getAttribute("aria-label")).toContain("30 seconds ago");
  });

  test("avatar fallback uses the first letter of name or email (initials surface)", () => {
    renderInProvider(
      <CoAuthorIndicator
        users={[
          {
            id: 7,
            name: "Ada Lovelace",
            email: "ada@example.test",
            lastSeenAt: T_NOW,
          },
          {
            id: 8,
            name: null,
            email: "bea@example.test",
            lastSeenAt: T_NOW,
          },
        ]}
        relativeTime={() => "now"}
      />,
    );
    const fallbacks = screen.getAllByTestId(/coauthor-avatar-fallback-/);
    expect(fallbacks).toHaveLength(2);
    expect(fallbacks[0]?.textContent).toBe("A"); // Ada
    expect(fallbacks[1]?.textContent).toBe("B"); // bea@
  });
});
