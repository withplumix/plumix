import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { PatternManifestEntry } from "@plumix/core/manifest";
import { createBlockRegistry, createPatternRegistry } from "@plumix/blocks";

import { renderWithI18n } from "../../test/render-with-i18n.js";
import { StarterModal } from "./StarterModal.js";

afterEach(() => {
  cleanup();
});

const blocks = createBlockRegistry([]);
const patternRegistry = createPatternRegistry([]);

const hero: PatternManifestEntry = {
  name: "starter/hero",
  title: "Hero start",
  content: [],
  target: "post-content",
  preview: {
    src: "/hero.png",
    width: 400,
    height: 240,
    alt: "Hero preview",
  },
};

const cta: PatternManifestEntry = {
  name: "starter/cta",
  title: "CTA start",
  content: [],
  target: "post-content",
  preview: {
    src: "/cta.png",
    width: 400,
    height: 240,
    alt: "CTA preview",
  },
};

describe("StarterModal", () => {
  test("renders nothing when there are no candidates", () => {
    const { container } = renderWithI18n(
      <StarterModal
        candidates={[]}
        blocks={blocks}
        patterns={patternRegistry}
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  test("renders one card per candidate plus a Start-from-blank action", () => {
    renderWithI18n(
      <StarterModal
        candidates={[hero, cta]}
        blocks={blocks}
        patterns={patternRegistry}
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByTestId("plumix-starter-modal")).toBeInTheDocument();
    expect(
      screen.getByTestId("plumix-starter-modal-card-starter/hero"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("plumix-starter-modal-card-starter/cta"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("plumix-starter-modal-start-blank"),
    ).toBeInTheDocument();
  });

  test("clicking a card calls onSelect with the chosen pattern", async () => {
    const onSelect = vi.fn();
    renderWithI18n(
      <StarterModal
        candidates={[hero, cta]}
        blocks={blocks}
        patterns={patternRegistry}
        onSelect={onSelect}
        onDismiss={vi.fn()}
      />,
    );

    await userEvent.click(
      screen.getByTestId("plumix-starter-modal-card-starter/cta"),
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(cta);
  });

  test("pressing Enter on a focused card calls onSelect (keyboard path)", async () => {
    const onSelect = vi.fn();
    renderWithI18n(
      <StarterModal
        candidates={[hero]}
        blocks={blocks}
        patterns={patternRegistry}
        onSelect={onSelect}
        onDismiss={vi.fn()}
      />,
    );

    const card = screen.getByTestId(`plumix-starter-modal-card-${hero.name}`);
    card.focus();
    await userEvent.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith(hero);
  });

  test("clicking Start from blank calls onDismiss", async () => {
    const onDismiss = vi.fn();
    renderWithI18n(
      <StarterModal
        candidates={[hero]}
        blocks={blocks}
        patterns={patternRegistry}
        onSelect={vi.fn()}
        onDismiss={onDismiss}
      />,
    );

    await userEvent.click(
      screen.getByTestId("plumix-starter-modal-start-blank"),
    );

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
