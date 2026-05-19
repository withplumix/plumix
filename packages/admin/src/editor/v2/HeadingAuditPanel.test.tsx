import type { BlockNode } from "@plumix/blocks";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { HeadingAuditPanel } from "./HeadingAuditPanel.js";

afterEach(() => {
  cleanup();
});

describe("HeadingAuditPanel", () => {
  test("renders the empty-state when no violations exist", () => {
    render(<HeadingAuditPanel tree={[]} />);

    expect(screen.getByTestId("heading-audit-empty").textContent).toBe(
      "No heading-structure issues detected.",
    );
  });

  test("renders one list item per violation with kind-specific testid", () => {
    const tree: readonly BlockNode[] = [
      { id: "a", name: "core/heading", attrs: { level: 1, text: "" } },
      { id: "b", name: "core/heading", attrs: { level: 4, text: "skip" } },
    ];

    render(<HeadingAuditPanel tree={tree} />);

    expect(screen.getByTestId("heading-audit-list")).toBeDefined();
    expect(
      screen.getByTestId("heading-audit-violation-empty-heading"),
    ).toBeDefined();
    expect(
      screen.getByTestId("heading-audit-violation-skipped-level"),
    ).toBeDefined();
  });

  test("describes a skipped-level violation with a remediation hint", () => {
    const tree: readonly BlockNode[] = [
      { id: "a", name: "core/heading", attrs: { level: 1, text: "Top" } },
      { id: "b", name: "core/heading", attrs: { level: 3, text: "Skip" } },
    ];

    render(<HeadingAuditPanel tree={tree} />);

    const item = screen.getByTestId("heading-audit-violation-skipped-level");
    expect(item.textContent).toContain("Heading jumps from h1 to h3.");
    expect(item.textContent).toContain("Insert an h2 between them.");
  });

  test("describes a multiple-h1 violation with the count using the literal <h1> text", () => {
    const tree: readonly BlockNode[] = [
      { id: "a", name: "core/heading", attrs: { level: 1, text: "First" } },
      { id: "b", name: "core/heading", attrs: { level: 1, text: "Second" } },
    ];

    render(<HeadingAuditPanel tree={tree} />);

    const item = screen.getByTestId("heading-audit-violation-multiple-h1");
    expect(item.textContent).toContain(
      "Multiple <h1> on the page (2 found).",
    );
  });

  test("emits data-node-ids on each list item so the action-bar follow-up can click-to-jump", () => {
    const tree: readonly BlockNode[] = [
      { id: "first", name: "core/heading", attrs: { level: 1, text: "A" } },
      { id: "second", name: "core/heading", attrs: { level: 1, text: "B" } },
      { id: "skip", name: "core/heading", attrs: { level: 4, text: "C" } },
    ];

    render(<HeadingAuditPanel tree={tree} />);

    expect(
      screen
        .getByTestId("heading-audit-violation-multiple-h1")
        .getAttribute("data-node-ids"),
    ).toBe("first,second");
    expect(
      screen
        .getByTestId("heading-audit-violation-skipped-level")
        .getAttribute("data-node-ids"),
    ).toBe("skip");
  });
});
