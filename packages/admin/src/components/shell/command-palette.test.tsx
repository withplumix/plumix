import type { ReactNode } from "react";
import { createQueryClient } from "@/providers/query-client.js";
import { DirectionProvider } from "@radix-ui/react-direction";
import { QueryClientProvider } from "@tanstack/react-query";
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
    { to: "/entries/posts", label: { id: "i.posts", message: "Posts" } },
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
      to: "/entries/$slug/$id/edit",
      params: { slug: "posts", id: 1 },
    });
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
      <DirectionProvider dir="rtl">
        <CommandPalette capabilities={[]} />
      </DirectionProvider>,
    );
    pressCmdK();

    await screen.findByTestId("command-palette-input");
  });
});
