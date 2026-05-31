import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { BlockSpec } from "@plumix/blocks";
import { createBlockRegistry } from "@plumix/blocks";

import type { TransformOption } from "./available-transforms.js";
import { BlockActionsPanel } from "./BlockActionsPanel.js";

afterEach(() => {
  cleanup();
});

function spec(partial: Partial<BlockSpec> & { name: string }): BlockSpec {
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
      screen.getByTestId("block-action-transform-to:core/heading").textContent,
    ).toContain("Heading");
    expect(
      screen.getByTestId("block-action-transform-to:core/quote"),
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
      screen.getByTestId("block-action-transform-to:core/heading"),
    );

    expect(onTransform).toHaveBeenCalledTimes(1);
    expect(onTransform.mock.calls[0]?.[0].targetName).toBe("core/heading");
  });

  test("hides the panel content when the spec has no available transforms and no other actions", () => {
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

  test("renders a Duplicate button that fires onDuplicate when clicked", async () => {
    const onDuplicate = vi.fn();
    const user = userEvent.setup();
    render(
      <BlockActionsPanel
        specName="core/paragraph"
        registry={paragraphWithTransforms}
        onTransform={vi.fn()}
        onDuplicate={onDuplicate}
      />,
    );

    await user.click(screen.getByTestId("block-action-duplicate"));

    expect(onDuplicate).toHaveBeenCalledTimes(1);
  });

  test("renders a Delete button that fires onDelete when clicked", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <BlockActionsPanel
        specName="core/paragraph"
        registry={paragraphWithTransforms}
        onTransform={vi.fn()}
        onDelete={onDelete}
      />,
    );

    await user.click(screen.getByTestId("block-action-delete"));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  test("renders a Copy JSON button that fires onCopyJson when clicked", async () => {
    const onCopyJson = vi.fn();
    const user = userEvent.setup();
    render(
      <BlockActionsPanel
        specName="core/paragraph"
        registry={paragraphWithTransforms}
        onTransform={vi.fn()}
        onCopyJson={onCopyJson}
      />,
    );

    await user.click(screen.getByTestId("block-action-copy-json"));

    expect(onCopyJson).toHaveBeenCalledTimes(1);
  });

  test("omits a button entirely when its callback is undefined", () => {
    render(
      <BlockActionsPanel
        specName="core/paragraph"
        registry={paragraphWithTransforms}
        onTransform={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );

    expect(screen.getByTestId("block-action-duplicate")).toBeDefined();
    expect(screen.queryByTestId("block-action-delete")).toBeNull();
    expect(screen.queryByTestId("block-action-copy-json")).toBeNull();
  });

  test("still renders the actions area when the spec has no transforms but other callbacks are present", () => {
    const noTransforms = createBlockRegistry([
      spec({ name: "core/spacer", title: "Spacer" }),
    ]);

    render(
      <BlockActionsPanel
        specName="core/spacer"
        registry={noTransforms}
        onTransform={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("block-actions-list")).toBeNull();
    expect(screen.getByTestId("block-action-delete")).toBeDefined();
  });

  test("renders the identity header with title and description when supplied", () => {
    const noTransforms = createBlockRegistry([
      spec({ name: "core/spacer", title: "Spacer" }),
    ]);

    render(
      <BlockActionsPanel
        specName="core/spacer"
        registry={noTransforms}
        identity={{
          title: "Bulleted list",
          icon: "List",
          description: "Disc bullets",
        }}
        onTransform={vi.fn()}
      />,
    );

    expect(screen.getByTestId("block-actions-identity")).toBeDefined();
    expect(
      screen.getByTestId("block-actions-identity-title"),
    ).toHaveTextContent("Bulleted list");
  });

  test("renders the panel when only identity is set — no transforms, no extras", () => {
    const noTransforms = createBlockRegistry([
      spec({ name: "core/spacer", title: "Spacer" }),
    ]);

    render(
      <BlockActionsPanel
        specName="core/spacer"
        registry={noTransforms}
        identity={{ title: "Spacer" }}
        onTransform={vi.fn()}
      />,
    );

    expect(screen.getByTestId("block-actions-panel")).toBeDefined();
    expect(screen.getByTestId("block-actions-identity")).toBeDefined();
  });

  test("renders two transform-scope variations of the same block as distinct buttons", () => {
    const columnsWithTwoVariations = createBlockRegistry([
      spec({
        name: "core/columns",
        title: "Columns",
        variations: [
          {
            slug: "two-up",
            title: "Two up",
            attrs: { layout: "split" },
            scope: ["transform"],
          },
          {
            slug: "three-up",
            title: "Three up",
            attrs: { layout: "three" },
            scope: ["transform"],
          },
        ],
      }),
    ]);
    render(
      <BlockActionsPanel
        specName="core/columns"
        registry={columnsWithTwoVariations}
        onTransform={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("block-action-transform-variation:two-up"),
    ).toHaveTextContent("Two up");
    expect(
      screen.getByTestId("block-action-transform-variation:three-up"),
    ).toHaveTextContent("Three up");
  });

  test("renders identity header even when identity.icon is undefined — neutral fallback glyph", () => {
    const noTransforms = createBlockRegistry([
      spec({ name: "core/spacer", title: "Spacer" }),
    ]);

    render(
      <BlockActionsPanel
        specName="core/spacer"
        registry={noTransforms}
        identity={{ title: "No-icon block" }}
        onTransform={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("block-actions-identity-title"),
    ).toHaveTextContent("No-icon block");
  });
});
