import type { ReactElement } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import type { BlockNode, ThemeTokens } from "@plumix/blocks";

import { EditorProvider, useEditorStore } from "./provider.js";
import { StylesTab } from "./styles-tab.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});
afterEach(cleanup);

const tokens: ThemeTokens = {
  spacing: { lg: { value: "24px" } },
  typography: { lg: { value: "20px" } },
};

function StyleProbe({ id }: { readonly id: string }): ReactElement {
  const style = useEditorStore((s) => s.tree.find((n) => n.id === id)?.style);
  return <output data-testid="style-probe">{JSON.stringify(style)}</output>;
}

function renderTab(tree: readonly BlockNode[], activeId?: string) {
  return render(
    <I18nProvider i18n={i18n}>
      <EditorProvider initialTree={tree}>
        <ActiveSeed activeId={activeId} />
        <StylesTab tokens={tokens} />
        <StyleProbe id={tree[0]?.id ?? ""} />
      </EditorProvider>
    </I18nProvider>,
  );
}

function ActiveSeed({ activeId }: { readonly activeId?: string }): null {
  const select = useEditorStore((s) => s.select);
  if (activeId) select(activeId);
  return null;
}

describe("StylesTab", () => {
  test("shows an empty state when nothing is selected", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }]);
    expect(getByTestId("styles-tab-empty")).toBeDefined();
  });

  test("writes a token style to the active desktop bucket", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    // Font family is the typography-token control (size/weight/line-height are
    // custom-only, since the theme has no scale for them).
    fireEvent.change(getByTestId("style-control-fontFamily-token"), {
      target: { value: "lg" },
    });

    expect(getByTestId("style-probe").textContent).toContain(
      '"large":{"fontFamily":{"token":"lg"}}',
    );
  });

  test("renders Margin and Padding as sibling cards, not nested", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");
    const margin = getByTestId("box-model-margin");
    const padding = getByTestId("box-model-padding");
    expect(margin.contains(padding)).toBe(false);
  });

  test("the italic mark toggles a fontStyle raw value", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    fireEvent.click(getByTestId("style-mark-italic"));

    expect(getByTestId("style-probe").textContent).toContain(
      '"fontStyle":{"raw":"italic"}',
    );
  });

  test("underline and strikethrough share textDecoration (mutually exclusive)", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    fireEvent.click(getByTestId("style-mark-underline"));
    expect(getByTestId("style-probe").textContent).toContain(
      '"textDecoration":{"raw":"underline"}',
    );

    // Strikethrough overwrites the shared property rather than accumulating.
    fireEvent.click(getByTestId("style-mark-strikethrough"));
    const probe = getByTestId("style-probe").textContent;
    expect(probe).toContain('"textDecoration":{"raw":"line-through"}');
    expect(probe).not.toContain("underline");
  });

  test("the align control writes a textAlign raw value", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    fireEvent.click(getByTestId("style-align-center"));

    expect(getByTestId("style-probe").textContent).toContain(
      '"textAlign":{"raw":"center"}',
    );
  });

  test("box-model writes a per-side custom padding value", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    fireEvent.click(getByTestId("style-control-paddingTop-mode-custom"));
    fireEvent.change(getByTestId("style-control-paddingTop-custom"), {
      target: { value: "12px" },
    });

    expect(getByTestId("style-probe").textContent).toContain(
      '"paddingTop":{"raw":"12px"}',
    );
  });
});
