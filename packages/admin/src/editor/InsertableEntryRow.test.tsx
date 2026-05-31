import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { InsertableBlockEntry } from "@plumix/blocks";
import { createBlockRegistry, createPatternRegistry } from "@plumix/blocks";

import { InsertableEntryRow } from "./InsertableEntryRow.js";
import { installFakeIntersectionObserver } from "./intersection-observer-harness.js";

const { intersect } = installFakeIntersectionObserver();

afterEach(() => {
  cleanup();
});

const blocks = createBlockRegistry([]);
const patterns = createPatternRegistry([]);

describe("InsertableEntryRow", () => {
  test("two variations sharing a slug across different parents get distinct testids", () => {
    const listBullet: InsertableBlockEntry = {
      name: "core/list",
      slug: "bullet",
      title: "Bulleted list",
    };
    const tabsBullet: InsertableBlockEntry = {
      name: "core/tabs",
      slug: "bullet",
      title: "Bulleted tabs",
    };
    render(
      <>
        <InsertableEntryRow
          entry={listBullet}
          blocks={blocks}
          patterns={patterns}
          onClick={vi.fn()}
        />
        <InsertableEntryRow
          entry={tabsBullet}
          blocks={blocks}
          patterns={patterns}
          onClick={vi.fn()}
        />
      </>,
    );
    expect(
      screen.getByTestId("plumix-blocks-tab-item-core/list/bullet"),
    ).toBeDefined();
    expect(
      screen.getByTestId("plumix-blocks-tab-item-core/tabs/bullet"),
    ).toBeDefined();
  });

  test("renders a plain block as a single-line row without a thumbnail", () => {
    const entry: InsertableBlockEntry = {
      name: "core/heading",
      slug: "core/heading",
      title: "Heading",
      icon: "Heading",
    };
    render(
      <InsertableEntryRow
        entry={entry}
        blocks={blocks}
        patterns={patterns}
        onClick={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("plumix-blocks-tab-item-core/heading"),
    ).toBeDefined();
    expect(
      screen.queryByTestId(
        "plumix-blocks-tab-thumbnail-placeholder-core/heading",
      ),
    ).toBeNull();
  });

  test("renders a variation as a two-line card with a lazy-mounted thumbnail placeholder", () => {
    const entry: InsertableBlockEntry = {
      name: "core/list",
      slug: "bullet",
      title: "Bulleted list",
      attrs: { variant: "bullet" },
    };
    render(
      <InsertableEntryRow
        entry={entry}
        blocks={blocks}
        patterns={patterns}
        onClick={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId(
        "plumix-blocks-tab-thumbnail-placeholder-core/list:bullet",
      ),
    ).toBeDefined();
    intersect();
    expect(
      screen.getByTestId("plumix-variation-thumbnail-core/list:bullet"),
    ).toBeDefined();
  });
});
