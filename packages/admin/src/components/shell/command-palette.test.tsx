import type { ReactNode } from "react";
import {
  _resetPaletteCommands,
  registerPaletteCommand,
} from "@/lib/palette-commands.js";
import { recordRecentNav } from "@/lib/recent-nav.js";
import { createQueryClient } from "@/providers/query-client.js";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { Direction } from "radix-ui";
import { afterEach, describe, expect, test, vi } from "vitest";

import { renderWithI18n } from "../../../test/render-with-i18n.js";
import { CommandPalette } from "./command-palette.js";

const navigate = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useNavigate: () => navigate,
}));

vi.mock("@/lib/palette-nav.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  paletteNavItems: () => [
    {
      to: "/entries/posts",
      label: { id: "i.posts", message: "Posts" },
      keywords: [{ id: "k.articles", message: "articles" }],
    },
    { to: "/users", label: { id: "i.users", message: "Users" } },
  ],
}));

vi.mock("@/lib/manifest.js", () => ({
  findEntryTypeByName: () => ({ adminSlug: "posts" }),
}));

vi.mock("@/lib/orpc.js", () => ({
  orpc: {
    search: {
      query: {
        queryOptions: (opts: {
          input: { query: string };
          enabled?: boolean;
        }) => ({
          queryKey: ["search", opts.input.query],
          queryFn: () => [
            {
              key: "entry:post",
              label: { id: "g.post", message: "Posts" },
              priority: 10,
              items: [{ id: "1", title: "Hello World" }],
            },
            {
              key: "term:category",
              label: { id: "g.category", message: "Categories" },
              priority: 100,
              items: [{ id: "7", title: "News" }],
            },
            {
              key: "users",
              label: { id: "g.users", message: "Users" },
              priority: 200,
              items: [
                { id: "9", title: "Alice", subtitle: "alice@example.com" },
              ],
            },
          ],
          enabled: opts.enabled,
        }),
      },
    },
  },
}));

function renderPalette(node: ReactNode): void {
  renderWithI18n(
    <QueryClientProvider client={createQueryClient()}>
      {node}
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  navigate.mockClear();
  _resetPaletteCommands();
  localStorage.clear();
});

function pressCmdK(): void {
  fireEvent.keyDown(document, { key: "k", metaKey: true });
}

describe("CommandPalette", () => {
  test("opens on Cmd+K and is closed before that", async () => {
    renderPalette(<CommandPalette capabilities={[]} />);
    expect(screen.queryByTestId("command-palette-input")).toBeNull();

    pressCmdK();

    await screen.findByTestId("command-palette-input");
  });

  test("opens on Ctrl+K for non-mac", async () => {
    renderPalette(<CommandPalette capabilities={[]} />);

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    await screen.findByTestId("command-palette-input");
  });

  test("lists navigation items and navigates on select", async () => {
    renderPalette(<CommandPalette capabilities={[]} />);
    pressCmdK();

    fireEvent.click(
      await screen.findByTestId("command-palette-nav-/entries/posts"),
    );

    expect(navigate).toHaveBeenCalledWith({ to: "/entries/posts" });
    await waitFor(() =>
      expect(screen.queryByTestId("command-palette-input")).toBeNull(),
    );
  });

  test("filters navigation items by the typed query", async () => {
    renderPalette(<CommandPalette capabilities={[]} />);
    pressCmdK();
    const input = await screen.findByTestId("command-palette-input");

    fireEvent.change(input, { target: { value: "users" } });

    await waitFor(() =>
      expect(
        screen.queryByTestId("command-palette-nav-/entries/posts"),
      ).toBeNull(),
    );
    screen.getByTestId("command-palette-nav-/users");
  });

  test("surfaces a navigation item by a keyword synonym, not just its label", async () => {
    renderPalette(<CommandPalette capabilities={[]} />);
    pressCmdK();
    const input = await screen.findByTestId("command-palette-input");

    fireEvent.change(input, { target: { value: "articles" } });

    await screen.findByTestId("command-palette-nav-/entries/posts");
    expect(screen.queryByTestId("command-palette-nav-/users")).toBeNull();
  });

  test("shows a Recent group of previously visited destinations on empty query", async () => {
    recordRecentNav("/users");
    renderPalette(<CommandPalette capabilities={[]} />);
    pressCmdK();

    await screen.findByTestId("command-palette-recent-/users");
  });

  test("renders a recent destination and its nav entry side by side", async () => {
    recordRecentNav("/users");
    renderPalette(<CommandPalette capabilities={[]} />);
    pressCmdK();

    await screen.findByTestId("command-palette-recent-/users");
    screen.getByTestId("command-palette-nav-/users");
  });

  test("records a visited destination so it surfaces under Recent next time", async () => {
    renderPalette(<CommandPalette capabilities={[]} />);
    pressCmdK();
    fireEvent.click(await screen.findByTestId("command-palette-nav-/users"));

    pressCmdK();

    await screen.findByTestId("command-palette-recent-/users");
  });

  test("shows server content results and opens the editor on select", async () => {
    renderPalette(<CommandPalette capabilities={[]} />);
    pressCmdK();
    fireEvent.change(await screen.findByTestId("command-palette-input"), {
      target: { value: "hello" },
    });

    const result = await screen.findByTestId(
      "command-palette-result-entry:post:1",
    );
    fireEvent.click(result);

    expect(navigate).toHaveBeenCalledWith({
      to: "/entries/$slug/$id/editor",
      params: { slug: "posts", id: 1 },
    });
  });

  test("shows a loading indicator while the search query is in flight", async () => {
    renderPalette(<CommandPalette capabilities={[]} />);
    pressCmdK();
    fireEvent.change(await screen.findByTestId("command-palette-input"), {
      target: { value: "hello" },
    });

    // Debounce hasn't elapsed yet — query !== debounced, so it's loading.
    expect(screen.getByTestId("command-palette-loading")).not.toBeNull();
  });

  test("opens the term editor when a term result is selected", async () => {
    renderPalette(<CommandPalette capabilities={[]} />);
    pressCmdK();
    fireEvent.change(await screen.findByTestId("command-palette-input"), {
      target: { value: "news" },
    });

    fireEvent.click(
      await screen.findByTestId("command-palette-result-term:category:7"),
    );

    expect(navigate).toHaveBeenCalledWith({
      to: "/terms/$name/$id/edit",
      params: { name: "category", id: 7 },
    });
  });

  test("opens a content result in a new tab on Cmd/Ctrl+click", async () => {
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    renderPalette(<CommandPalette capabilities={[]} />);
    pressCmdK();
    fireEvent.change(await screen.findByTestId("command-palette-input"), {
      target: { value: "hello" },
    });

    fireEvent.click(
      await screen.findByTestId("command-palette-result-entry:post:1"),
      { metaKey: true },
    );

    expect(openSpy).toHaveBeenCalledWith(
      "/_plumix/admin/entries/posts/1/edit",
      "_blank",
      "noopener,noreferrer",
    );
    expect(navigate).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  test("opens the user editor when a user result is selected", async () => {
    renderPalette(<CommandPalette capabilities={[]} />);
    pressCmdK();
    fireEvent.change(await screen.findByTestId("command-palette-input"), {
      target: { value: "alice" },
    });

    fireEvent.click(
      await screen.findByTestId("command-palette-result-users:9"),
    );

    expect(navigate).toHaveBeenCalledWith({
      to: "/users/$id/edit",
      params: { id: 9 },
    });
  });

  test("runs a registered command and closes the palette", async () => {
    const run = vi.fn();
    registerPaletteCommand({
      id: "plugin:do-x",
      title: { id: "cmd.x", message: "Do X" },
      run,
    });
    renderPalette(<CommandPalette capabilities={[]} />);
    pressCmdK();

    fireEvent.click(
      await screen.findByTestId("command-palette-command-plugin:do-x"),
    );

    expect(run).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByTestId("command-palette-input")).toBeNull(),
    );
  });

  test("hides a command whose capability the user lacks", async () => {
    registerPaletteCommand({
      id: "plugin:secret",
      title: { id: "cmd.secret", message: "Secret" },
      capability: "secret:do",
      run: vi.fn(),
    });
    renderPalette(<CommandPalette capabilities={[]} />);
    pressCmdK();
    await screen.findByTestId("command-palette-input");

    expect(
      screen.queryByTestId("command-palette-command-plugin:secret"),
    ).toBeNull();
  });

  test("renders a footer with keyboard hints", async () => {
    renderPalette(<CommandPalette capabilities={[]} />);
    pressCmdK();

    await screen.findByTestId("command-palette-footer");
  });

  test("Escape closes the palette", async () => {
    renderPalette(<CommandPalette capabilities={[]} />);
    pressCmdK();
    const input = await screen.findByTestId("command-palette-input");

    fireEvent.keyDown(input, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByTestId("command-palette-input")).toBeNull(),
    );
  });

  test("mounts under an RTL direction provider without crashing", async () => {
    renderPalette(
      <Direction.DirectionProvider dir="rtl">
        <CommandPalette capabilities={[]} />
      </Direction.DirectionProvider>,
    );
    pressCmdK();

    await screen.findByTestId("command-palette-input");
  });
});
