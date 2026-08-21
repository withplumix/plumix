import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { DocumentSettingsPanel } from "./document-settings.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(cleanup);

const BASE = { slug: "hello-world", onSlugChange: vi.fn() } as const;

function renderPanel(
  props: Parameters<typeof DocumentSettingsPanel>[0],
): ReturnType<typeof render> {
  return render(
    <I18nProvider i18n={i18n}>
      <DocumentSettingsPanel {...props} />
    </I18nProvider>,
  );
}

describe("DocumentSettingsPanel taxonomies", () => {
  test("renders a term picker per taxonomy", () => {
    const { getByTestId } = renderPanel({
      ...BASE,
      taxonomies: [
        {
          name: "category",
          label: "Categories",
          options: [{ value: "1", label: "News", depth: 0 }],
          value: ["1"],
          onChange: vi.fn(),
        },
        {
          name: "post_tag",
          label: "Tags",
          options: [],
          value: [],
          onChange: vi.fn(),
        },
      ],
    });
    expect(getByTestId("entry-taxonomy-category")).toBeDefined();
    expect(getByTestId("entry-taxonomy-post_tag")).toBeDefined();
  });

  test("renders no taxonomy pickers when the prop is omitted", () => {
    const { queryByTestId } = renderPanel(BASE);
    expect(queryByTestId("entry-taxonomy-category")).toBeNull();
  });
});

describe("DocumentSettingsPanel template picker", () => {
  test("renders the picker when the theme registers named templates", () => {
    const { getByTestId } = renderPanel({
      ...BASE,
      template: {
        value: null,
        options: [
          { id: "landing", label: "Landing Page" },
          { id: "wide", label: "Wide" },
        ],
        onChange: vi.fn(),
      },
    });
    expect(getByTestId("entry-template-select")).toBeDefined();
  });

  test("renders no picker when there are no named templates", () => {
    const { queryByTestId } = renderPanel({
      ...BASE,
      template: { value: null, options: [], onChange: vi.fn() },
    });
    expect(queryByTestId("entry-template-select")).toBeNull();
  });
});

describe("DocumentSettingsPanel visibility picker", () => {
  test("renders the picker when the type declares selectable policies", () => {
    const { getByTestId } = renderPanel({
      ...BASE,
      access: {
        value: "members",
        options: [
          { key: "members", label: "Members only" },
          { key: "staff", label: "Staff only" },
        ],
        onChange: vi.fn(),
      },
    });
    expect(getByTestId("entry-visibility-select")).toBeDefined();
  });

  test("renders no picker when the type declares no selectable policies", () => {
    const { queryByTestId } = renderPanel({
      ...BASE,
      access: { value: null, options: [], onChange: vi.fn() },
    });
    expect(queryByTestId("entry-visibility-select")).toBeNull();
  });
});
