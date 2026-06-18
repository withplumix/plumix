import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { TooltipProvider } from "@plumix/admin-ui/tooltip";

import { renderWithI18n } from "../../test/render-with-i18n.js";
import { toastError } from "../lib/toast.js";
import { PreviewButton } from "./PreviewButton.js";

vi.mock("../lib/toast.js", () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

interface FakeWindow {
  location: { href: string };
  opener: unknown;
  close: ReturnType<typeof vi.fn>;
}

function stubWindowOpen(): FakeWindow {
  const fake: FakeWindow = {
    location: { href: "" },
    opener: {},
    close: vi.fn(),
  };
  vi.stubGlobal(
    "open",
    vi.fn(() => fake),
  );
  return fake;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal("navigator", {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("PreviewButton", () => {
  test("opens the minted preview in a new tab and severs the opener", async () => {
    const win = stubWindowOpen();
    const mintPreviewLink = vi
      .fn()
      .mockResolvedValue({ url: "/post/secret?preview=tok123" });
    renderWithI18n(
      <TooltipProvider>
        <PreviewButton mintPreviewLink={mintPreviewLink} />
      </TooltipProvider>,
    );

    await userEvent.click(screen.getByTestId("editor-preview"));

    await waitFor(() => {
      expect(win.location.href).toBe(
        `${window.location.origin}/post/secret?preview=tok123`,
      );
    });
    expect(win.opener).toBeNull();
    expect(mintPreviewLink).toHaveBeenCalledOnce();
  });

  test("closes the tab and toasts when minting the preview fails", async () => {
    const win = stubWindowOpen();
    const mintPreviewLink = vi.fn().mockRejectedValue(new Error("nope"));
    renderWithI18n(
      <TooltipProvider>
        <PreviewButton mintPreviewLink={mintPreviewLink} />
      </TooltipProvider>,
    );

    await userEvent.click(screen.getByTestId("editor-preview"));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledOnce();
    });
    expect(win.close).toHaveBeenCalledOnce();
  });
});
