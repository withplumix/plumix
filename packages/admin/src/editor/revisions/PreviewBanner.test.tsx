import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { PreviewBanner } from "./PreviewBanner.js";

afterEach(() => {
  cleanup();
});

const T0 = new Date("2026-05-22T12:00:00Z");

describe("PreviewBanner", () => {
  test("renders the revision metadata so the user knows what they're previewing", () => {
    render(
      <PreviewBanner
        revisionUpdatedAt={T0}
        revisionAuthor="Ada Lovelace"
        relativeTime={() => "2 hours ago"}
        onBackToLive={vi.fn()}
        onRestore={vi.fn()}
        isRestoring={false}
      />,
    );
    const banner = screen.getByTestId("revision-preview-banner");
    expect(banner.textContent).toContain("Ada Lovelace");
    expect(banner.textContent).toContain("2 hours ago");
  });

  test("clicking Back to live fires onBackToLive", () => {
    const onBackToLive = vi.fn();
    render(
      <PreviewBanner
        revisionUpdatedAt={T0}
        revisionAuthor="Ada"
        relativeTime={() => "now"}
        onBackToLive={onBackToLive}
        onRestore={vi.fn()}
        isRestoring={false}
      />,
    );
    fireEvent.click(screen.getByTestId("revision-preview-back-to-live"));
    expect(onBackToLive).toHaveBeenCalled();
  });

  test("clicking Restore fires onRestore", () => {
    const onRestore = vi.fn();
    render(
      <PreviewBanner
        revisionUpdatedAt={T0}
        revisionAuthor="Ada"
        relativeTime={() => "now"}
        onBackToLive={vi.fn()}
        onRestore={onRestore}
        isRestoring={false}
      />,
    );
    fireEvent.click(screen.getByTestId("revision-preview-restore"));
    expect(onRestore).toHaveBeenCalled();
  });

  test("Restore button disables while a restore is in flight", () => {
    render(
      <PreviewBanner
        revisionUpdatedAt={T0}
        revisionAuthor="Ada"
        relativeTime={() => "now"}
        onBackToLive={vi.fn()}
        onRestore={vi.fn()}
        isRestoring={true}
      />,
    );
    const restore = screen.getByTestId("revision-preview-restore");
    expect(restore).toBeDisabled();
  });

  test("surfaces restoreError inline so a stale-token CONFLICT doesn't look like a silent no-op", () => {
    render(
      <PreviewBanner
        revisionUpdatedAt={T0}
        revisionAuthor="Ada"
        relativeTime={() => "now"}
        onBackToLive={vi.fn()}
        onRestore={vi.fn()}
        isRestoring={false}
        restoreError="Another editor changed this entry. Reload and try again."
      />,
    );
    const err = screen.getByTestId("revision-preview-restore-error");
    expect(err.textContent).toContain("Another editor changed this entry");
  });
});
