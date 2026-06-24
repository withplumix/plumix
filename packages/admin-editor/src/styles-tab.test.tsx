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

describe("StylesTab — declarations list", () => {
  const styled: BlockNode = {
    id: "a",
    name: "core/x",
    style: { large: { color: { raw: "#0c2238" } } },
  };

  test("lists each declaration in the active bucket with its raw value", () => {
    const { getByTestId } = renderTab([styled], "a");
    const value = getByTestId(
      "style-declaration-color-value",
    ) as HTMLInputElement;
    expect(value.value).toBe("#0c2238");
  });

  test("editing a declaration's value writes it back to the bucket", () => {
    const { getByTestId } = renderTab([styled], "a");
    fireEvent.change(getByTestId("style-declaration-color-value"), {
      target: { value: "rebeccapurple" },
    });
    expect(getByTestId("style-probe").textContent).toContain(
      '"color":{"raw":"rebeccapurple"}',
    );
  });

  test("clearing the value keeps the row (only the Trash button deletes)", () => {
    const { getByTestId } = renderTab([styled], "a");
    fireEvent.change(getByTestId("style-declaration-color-value"), {
      target: { value: "" },
    });
    // Row survives an empty value so retyping doesn't unmount the focused input.
    expect(getByTestId("style-declaration-color-value")).toBeDefined();
    expect(getByTestId("style-probe").textContent).toContain(
      '"color":{"raw":""}',
    );
  });

  test("removing a declaration clears the property", () => {
    const { getByTestId } = renderTab([styled], "a");
    fireEvent.click(getByTestId("style-declaration-color-remove"));
    // The only property is gone, so the style slot prunes to undefined.
    expect(getByTestId("style-probe").textContent).toBe("");
  });

  test("a token declaration shows its token id read-only (value lives in theme)", () => {
    const tokenStyled: BlockNode = {
      id: "a",
      name: "core/x",
      style: { large: { color: { token: "primary" } } },
    };
    const { getByTestId, queryByTestId } = renderTab([tokenStyled], "a");
    expect(getByTestId("style-declaration-color-token").textContent).toBe(
      "primary",
    );
    expect(queryByTestId("style-declaration-color-value")).toBeNull();
  });

  test("shows an empty hint when the block has no styles for the device", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");
    expect(getByTestId("style-declarations-empty")).toBeDefined();
  });

  test("adds a new declaration from the key + value fields", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");
    fireEvent.change(getByTestId("style-declaration-add-key"), {
      target: { value: "letterSpacing" },
    });
    fireEvent.change(getByTestId("style-declaration-add-value"), {
      target: { value: "0.05em" },
    });
    fireEvent.click(getByTestId("style-declaration-add-submit"));
    expect(getByTestId("style-probe").textContent).toContain(
      '"letterSpacing":{"raw":"0.05em"}',
    );
  });

  test("clears the add fields after a successful add", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");
    fireEvent.change(getByTestId("style-declaration-add-key"), {
      target: { value: "opacity" },
    });
    fireEvent.change(getByTestId("style-declaration-add-value"), {
      target: { value: "0.5" },
    });
    fireEvent.click(getByTestId("style-declaration-add-submit"));
    expect(
      (getByTestId("style-declaration-add-key") as HTMLInputElement).value,
    ).toBe("");
    expect(
      (getByTestId("style-declaration-add-value") as HTMLInputElement).value,
    ).toBe("");
  });

  test("does not add a declaration with an invalid key", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");
    fireEvent.change(getByTestId("style-declaration-add-key"), {
      target: { value: "bad key!" },
    });
    fireEvent.change(getByTestId("style-declaration-add-value"), {
      target: { value: "1px" },
    });
    fireEvent.click(getByTestId("style-declaration-add-submit"));
    // Invalid CSS property name → no write, slot stays undefined.
    expect(getByTestId("style-probe").textContent).toBe("");
  });

  test("does not add a declaration with an empty value", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");
    fireEvent.change(getByTestId("style-declaration-add-key"), {
      target: { value: "opacity" },
    });
    fireEvent.click(getByTestId("style-declaration-add-submit"));
    // A blank value would drop at emit, so submit stays gated.
    expect(getByTestId("style-probe").textContent).toBe("");
  });

  test("does not add a key that already exists (no silent overwrite)", () => {
    const { getByTestId } = renderTab([styled], "a");
    fireEvent.change(getByTestId("style-declaration-add-key"), {
      target: { value: "color" },
    });
    fireEvent.change(getByTestId("style-declaration-add-value"), {
      target: { value: "red" },
    });
    fireEvent.click(getByTestId("style-declaration-add-submit"));
    // The existing color declaration is untouched.
    expect(getByTestId("style-probe").textContent).toContain(
      '"color":{"raw":"#0c2238"}',
    );
    expect(getByTestId("style-probe").textContent).not.toContain("red");
  });
});
