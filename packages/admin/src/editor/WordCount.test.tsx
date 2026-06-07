import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import { messages as enMessages } from "../../locales/en.mjs";
import { WordCountView } from "./WordCount.js";

beforeAll(() => {
  i18n.load("en", enMessages);
  i18n.activate("en");
});

afterEach(cleanup);

function renderView(words: number, characters: number): void {
  render(
    <I18nProvider i18n={i18n}>
      <WordCountView words={words} characters={characters} />
    </I18nProvider>,
  );
}

describe("WordCountView", () => {
  test("renders the word figure and exposes both counts on data attrs", () => {
    renderView(5, 23);
    const el = screen.getByTestId("plumix-editor-word-count");
    expect(el).toHaveAttribute("data-words", "5");
    expect(el).toHaveAttribute("data-characters", "23");
    expect(el.textContent).toContain("5");
  });

  test("accessible name carries both words and characters", () => {
    renderView(1, 1);
    const el = screen.getByTestId("plumix-editor-word-count");
    const label = el.getAttribute("aria-label") ?? "";
    // Singular plural forms resolve, and both metrics are in the name.
    expect(label).toContain("word");
    expect(label).toContain("character");
  });
});
