import type { BlockSpecV2 } from "@plumix/blocks";
import { createBlockRegistry } from "@plumix/blocks";

import type { TransformOption } from "./available-transforms.js";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { BlockActionsPanel } from "./BlockActionsPanel.js";

afterEach(() => {
  cleanup();
});

function spec(partial: Partial<BlockSpecV2> & { name: string }): BlockSpecV2 {
  return { render: () => null, ...partial };
}

const paragraphWithTransforms = createBlockRegistry([
  spec({
    name: "core/paragraph",
    title: "Paragraph",
    transforms: {
      priority: 50,
      to: [{ target: "core/heading" }, { target: "core/quote" }],
    },
  }),
  spec({ name: "core/heading", title: "Heading" }),
  spec({ name: "core/quote", title: "Quote" }),
]);

describe("BlockActionsPanel", () => {
  test("renders the empty-state when no spec name is provided", () => {
    render(
      <BlockActionsPanel
        specName={undefined}
        registry={paragraphWithTransforms}
        onTransform={vi.fn()}
      />,
    );

    expect(screen.getByTestId("block-actions-empty")).toBeDefined();
  });

  test("renders one button per available transform target with the target title", () => {
    render(
      <BlockActionsPanel
        specName="core/paragraph"
        registry={paragraphWithTransforms}
        onTransform={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("block-action-transform-core/heading").textContent,
    ).toContain("Heading");
    expect(
      screen.getByTestId("block-action-transform-core/quote"),
    ).toBeDefined();
  });

  test("invokes onTransform with the option when its button is clicked", async () => {
    const onTransform = vi.fn<(option: TransformOption) => void>();
    const user = userEvent.setup();
    render(
      <BlockActionsPanel
        specName="core/paragraph"
        registry={paragraphWithTransforms}
        onTransform={onTransform}
      />,
    );

    await user.click(
      screen.getByTestId("block-action-transform-core/heading"),
    );

    expect(onTransform).toHaveBeenCalledTimes(1);
    expect(onTransform.mock.calls[0]?.[0].targetName).toBe("core/heading");
  });

  test("hides the panel content when the spec has no available transforms", () => {
    const noTransforms = createBlockRegistry([
      spec({ name: "core/spacer", title: "Spacer" }),
    ]);

    render(
      <BlockActionsPanel
        specName="core/spacer"
        registry={noTransforms}
        onTransform={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("block-actions-list")).toBeNull();
  });
});
