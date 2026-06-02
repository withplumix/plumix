import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { renderWithI18n } from "../../test/render-with-i18n.js";
import { StaleDraftDialog } from "./StaleDraftDialog.js";

afterEach(() => {
  cleanup();
});

interface Snapshot {
  readonly title: string;
  readonly content: unknown;
}

const AUTOSAVE: Snapshot = {
  title: "My pending edit",
  content: { blocks: [{ name: "core/heading", attrs: {} }] },
};
const LIVE: Snapshot = {
  title: "Latest published",
  content: { blocks: [{ name: "core/rich-text", attrs: {} }] },
};

describe("StaleDraftDialog", () => {
  test("renders the three actions when open", () => {
    renderWithI18n(
      <StaleDraftDialog
        open={true}
        autosaveSnapshot={AUTOSAVE}
        liveSnapshot={LIVE}
        onUseMine={vi.fn()}
        onUseTheirs={vi.fn()}
        isResolving={false}
      />,
    );
    expect(screen.getByTestId("stale-draft-use-mine")).toBeInTheDocument();
    expect(screen.getByTestId("stale-draft-use-theirs")).toBeInTheDocument();
    expect(screen.getByTestId("stale-draft-compare")).toBeInTheDocument();
  });

  test("does not render anything when open=false", () => {
    renderWithI18n(
      <StaleDraftDialog
        open={false}
        autosaveSnapshot={AUTOSAVE}
        liveSnapshot={LIVE}
        onUseMine={vi.fn()}
        onUseTheirs={vi.fn()}
        isResolving={false}
      />,
    );
    expect(
      screen.queryByTestId("stale-draft-use-mine"),
    ).not.toBeInTheDocument();
  });

  test("clicking Use mine fires onUseMine", () => {
    const onUseMine = vi.fn();
    renderWithI18n(
      <StaleDraftDialog
        open={true}
        autosaveSnapshot={AUTOSAVE}
        liveSnapshot={LIVE}
        onUseMine={onUseMine}
        onUseTheirs={vi.fn()}
        isResolving={false}
      />,
    );
    fireEvent.click(screen.getByTestId("stale-draft-use-mine"));
    expect(onUseMine).toHaveBeenCalledOnce();
  });

  test("clicking Use theirs fires onUseTheirs", () => {
    const onUseTheirs = vi.fn();
    renderWithI18n(
      <StaleDraftDialog
        open={true}
        autosaveSnapshot={AUTOSAVE}
        liveSnapshot={LIVE}
        onUseMine={vi.fn()}
        onUseTheirs={onUseTheirs}
        isResolving={false}
      />,
    );
    fireEvent.click(screen.getByTestId("stale-draft-use-theirs"));
    expect(onUseTheirs).toHaveBeenCalledOnce();
  });

  test("clicking Compare expands an inline side-by-side JSON diff", () => {
    renderWithI18n(
      <StaleDraftDialog
        open={true}
        autosaveSnapshot={AUTOSAVE}
        liveSnapshot={LIVE}
        onUseMine={vi.fn()}
        onUseTheirs={vi.fn()}
        isResolving={false}
      />,
    );
    expect(
      screen.queryByTestId("stale-draft-compare-panes"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("stale-draft-compare"));
    const panes = screen.getByTestId("stale-draft-compare-panes");
    expect(panes.textContent).toContain("core/heading"); // autosave content
    expect(panes.textContent).toContain("core/rich-text"); // live content
  });

  test("Use mine and Use theirs disable while a resolution is in flight", () => {
    renderWithI18n(
      <StaleDraftDialog
        open={true}
        autosaveSnapshot={AUTOSAVE}
        liveSnapshot={LIVE}
        onUseMine={vi.fn()}
        onUseTheirs={vi.fn()}
        isResolving={true}
      />,
    );
    expect(screen.getByTestId("stale-draft-use-mine")).toBeDisabled();
    expect(screen.getByTestId("stale-draft-use-theirs")).toBeDisabled();
  });
});
