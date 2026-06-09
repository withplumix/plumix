import { DirectionProvider } from "@radix-ui/react-direction";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { renderWithI18n } from "../../../test/render-with-i18n.js";
import { CommandPalette } from "./command-palette.js";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useNavigate: () => navigate,
}));

vi.mock("@/lib/palette-nav.js", () => ({
  paletteNavItems: () => [
    {
      to: "/entries/posts",
      label: { id: "i.posts", message: "Posts" },
      coreIcon: "file-text",
    },
    {
      to: "/users",
      label: { id: "i.users", message: "Users" },
      coreIcon: "users",
    },
  ],
}));

afterEach(() => {
  cleanup();
  navigate.mockClear();
});

function pressCmdK(): void {
  fireEvent.keyDown(document, { key: "k", metaKey: true });
}

describe("CommandPalette", () => {
  test("opens on Cmd+K and is closed before that", async () => {
    renderWithI18n(<CommandPalette capabilities={[]} />);
    expect(screen.queryByTestId("command-palette-input")).toBeNull();

    pressCmdK();

    await screen.findByTestId("command-palette-input");
  });

  test("opens on Ctrl+K for non-mac", async () => {
    renderWithI18n(<CommandPalette capabilities={[]} />);

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    await screen.findByTestId("command-palette-input");
  });

  test("lists navigation items from the shared nav source", async () => {
    renderWithI18n(<CommandPalette capabilities={[]} />);
    pressCmdK();

    await screen.findByTestId("command-palette-nav-/entries/posts");
    screen.getByTestId("command-palette-nav-/users");
  });

  test("selecting a navigation item navigates and closes the palette", async () => {
    renderWithI18n(<CommandPalette capabilities={[]} />);
    pressCmdK();

    fireEvent.click(
      await screen.findByTestId("command-palette-nav-/entries/posts"),
    );

    expect(navigate).toHaveBeenCalledWith({ to: "/entries/posts" });
    await waitFor(() =>
      expect(screen.queryByTestId("command-palette-input")).toBeNull(),
    );
  });

  test("Escape closes the palette", async () => {
    renderWithI18n(<CommandPalette capabilities={[]} />);
    pressCmdK();
    const input = await screen.findByTestId("command-palette-input");

    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByTestId("command-palette-input")).toBeNull(),
    );
  });

  test("mounts under an RTL direction provider without crashing", async () => {
    renderWithI18n(
      <DirectionProvider dir="rtl">
        <CommandPalette capabilities={[]} />
      </DirectionProvider>,
    );
    pressCmdK();

    await screen.findByTestId("command-palette-input");
  });
});
