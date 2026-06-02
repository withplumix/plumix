import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import { renderWithI18n } from "../../../test/render-with-i18n.js";
import { RevisionDiffPanel } from "./RevisionDiffPanel.js";

afterEach(() => {
  cleanup();
});

function fixture(
  overrides: {
    readonly revision?: Record<string, unknown>;
    readonly current?: Record<string, unknown>;
  } = {},
) {
  return {
    revision: {
      title: "Old title",
      slug: "old",
      excerpt: null,
      content: {
        type: "doc",
        content: [
          {
            type: "core/paragraph",
            content: [{ type: "text", text: "Hello world" }],
          },
        ],
      },
      meta: {},
      ...(overrides.revision ?? {}),
    },
    current: {
      title: "Old title",
      slug: "old",
      excerpt: null,
      content: {
        type: "doc",
        content: [
          {
            type: "core/paragraph",
            content: [{ type: "text", text: "Hello world" }],
          },
        ],
      },
      meta: {},
      ...(overrides.current ?? {}),
    },
  };
}

describe("RevisionDiffPanel", () => {
  test("renders the Visual tab by default with empty state when content matches", () => {
    const { revision, current } = fixture();
    renderWithI18n(<RevisionDiffPanel revision={revision} current={current} />);
    expect(screen.getByTestId("revision-diff-pane-visual")).toBeInTheDocument();
    expect(screen.getByTestId("revision-diff-empty")).toBeInTheDocument();
  });

  test("only renders field diffs for fields that actually changed", () => {
    const { revision, current } = fixture({
      current: { title: "New title" },
    });
    renderWithI18n(<RevisionDiffPanel revision={revision} current={current} />);
    expect(screen.getByTestId("revision-diff-field-title")).toBeInTheDocument();
    expect(
      screen.queryByTestId("revision-diff-field-slug"),
    ).not.toBeInTheDocument();
  });

  test("Raw JSON tab renders the jsondiffpatch delta in the DOM", () => {
    const { revision, current } = fixture({
      current: {
        content: {
          type: "doc",
          content: [
            {
              type: "core/paragraph",
              content: [{ type: "text", text: "Hello there" }],
            },
          ],
        },
      },
    });
    renderWithI18n(
      <RevisionDiffPanel
        revision={revision}
        current={current}
        defaultTab="json"
      />,
    );
    const pane = screen.getByTestId("revision-diff-pane-json");
    expect(pane.textContent).toContain("content");
  });
});
