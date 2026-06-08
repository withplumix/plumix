import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { renderWithI18n } from "../../test/render-with-i18n.js";
import { toastError, toastSuccess } from "../lib/toast.js";
import { CopyPreviewLinkButton } from "./CopyPreviewLinkButton.js";

vi.mock("../lib/toast.js", () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  vi.stubGlobal("navigator", {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("CopyPreviewLinkButton", () => {
  test("mints a link, copies the absolute url, and toasts success", async () => {
    const mintPreviewLink = vi
      .fn()
      .mockResolvedValue({ url: "/post/secret?preview=tok123" });
    renderWithI18n(<CopyPreviewLinkButton mintPreviewLink={mintPreviewLink} />);

    await userEvent.click(screen.getByTestId("editor-copy-preview-link"));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/post/secret?preview=tok123`,
      );
    });
    expect(mintPreviewLink).toHaveBeenCalledOnce();
    expect(toastSuccess).toHaveBeenCalledOnce();
  });

  test("toasts an error when minting fails", async () => {
    const mintPreviewLink = vi.fn().mockRejectedValue(new Error("nope"));
    renderWithI18n(<CopyPreviewLinkButton mintPreviewLink={mintPreviewLink} />);

    await userEvent.click(screen.getByTestId("editor-copy-preview-link"));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledOnce();
    });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  test("toasts an error when the clipboard write fails", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });
    const mintPreviewLink = vi
      .fn()
      .mockResolvedValue({ url: "/post/secret?preview=tok" });
    renderWithI18n(<CopyPreviewLinkButton mintPreviewLink={mintPreviewLink} />);

    await userEvent.click(screen.getByTestId("editor-copy-preview-link"));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledOnce();
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
