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

  test("offers CSS property suggestions in the key combobox", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");
    fireEvent.click(getByTestId("style-declaration-add-key"));
    expect(
      getByTestId("style-declaration-add-key-option-marginTop"),
    ).toBeDefined();
    expect(
      getByTestId("style-declaration-add-key-option-display"),
    ).toBeDefined();
  });

  test("adds a declaration by picking a property and typing a value", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");
    fireEvent.click(getByTestId("style-declaration-add-key"));
    fireEvent.click(
      getByTestId("style-declaration-add-key-option-letterSpacing"),
    );
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
    fireEvent.click(getByTestId("style-declaration-add-key"));
    fireEvent.click(getByTestId("style-declaration-add-key-option-opacity"));
    fireEvent.change(getByTestId("style-declaration-add-value"), {
      target: { value: "0.5" },
    });
    fireEvent.click(getByTestId("style-declaration-add-submit"));
    // Property resets (submit re-disables) and the value field empties.
    expect(getByTestId("style-declaration-add-submit")).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      (getByTestId("style-declaration-add-value") as HTMLInputElement).value,
    ).toBe("");
  });

  test("excludes already-set properties from the suggestions", () => {
    const { getByTestId, queryByTestId } = renderTab([styled], "a");
    fireEvent.click(getByTestId("style-declaration-add-key"));
    // `color` is already set, so it can't be re-added (no silent overwrite).
    expect(queryByTestId("style-declaration-add-key-option-color")).toBeNull();
    expect(
      getByTestId("style-declaration-add-key-option-marginTop"),
    ).toBeDefined();
  });

  test("can add a property outside the curated list via the create item", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");
    fireEvent.click(getByTestId("style-declaration-add-key"));
    fireEvent.change(getByTestId("style-declaration-add-key-search"), {
      target: { value: "scrollSnapAlign" },
    });
    fireEvent.click(getByTestId("style-declaration-add-key-create"));
    fireEvent.change(getByTestId("style-declaration-add-value"), {
      target: { value: "start" },
    });
    fireEvent.click(getByTestId("style-declaration-add-submit"));
    expect(getByTestId("style-probe").textContent).toContain(
      '"scrollSnapAlign":{"raw":"start"}',
    );
  });

  test("offers no create item for an invalid property name", () => {
    const { getByTestId, queryByTestId } = renderTab(
      [{ id: "a", name: "core/x" }],
      "a",
    );
    fireEvent.click(getByTestId("style-declaration-add-key"));
    fireEvent.change(getByTestId("style-declaration-add-key-search"), {
      target: { value: "bad key!" },
    });
    expect(queryByTestId("style-declaration-add-key-create")).toBeNull();
  });

  test("does not add a declaration with an empty value", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");
    fireEvent.click(getByTestId("style-declaration-add-key"));
    fireEvent.click(getByTestId("style-declaration-add-key-option-opacity"));
    fireEvent.click(getByTestId("style-declaration-add-submit"));
    // A blank value would drop at emit, so submit stays gated.
    expect(getByTestId("style-probe").textContent).toBe("");
  });

  test("won't overwrite a property that became set after it was picked", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");
    // Pick marginTop in the add row, then set marginTop via the Margin control
    // before submitting — the add submit must not clobber the control's value.
    fireEvent.click(getByTestId("style-declaration-add-key"));
    fireEvent.click(getByTestId("style-declaration-add-key-option-marginTop"));
    fireEvent.click(getByTestId("style-control-marginTop-mode-custom"));
    fireEvent.change(getByTestId("style-control-marginTop-custom"), {
      target: { value: "8px" },
    });
    fireEvent.change(getByTestId("style-declaration-add-value"), {
      target: { value: "99px" },
    });
    fireEvent.click(getByTestId("style-declaration-add-submit"));
    expect(getByTestId("style-probe").textContent).toContain(
      '"marginTop":{"raw":"8px"}',
    );
    expect(getByTestId("style-probe").textContent).not.toContain("99px");
  });

  test("a raw value added in the list reflects in the matching control", () => {
    // paddingTop's control defaults to token mode; adding a raw value via the
    // list must flip it to its custom input showing that value (two-way bind).
    const { getByTestId, queryByTestId } = renderTab(
      [{ id: "a", name: "core/x" }],
      "a",
    );
    expect(queryByTestId("style-control-paddingTop-custom")).toBeNull();

    fireEvent.click(getByTestId("style-declaration-add-key"));
    fireEvent.click(getByTestId("style-declaration-add-key-option-paddingTop"));
    fireEvent.change(getByTestId("style-declaration-add-value"), {
      target: { value: "7px" },
    });
    fireEvent.click(getByTestId("style-declaration-add-submit"));

    const control = getByTestId(
      "style-control-paddingTop-custom",
    ) as HTMLInputElement;
    expect(control.value).toBe("7px");
  });

  test("switching a token value to custom mode clears it and shows the input", () => {
    const tokenStyled: BlockNode = {
      id: "a",
      name: "core/x",
      style: { large: { color: { token: "lg" } } },
    };
    const { getByTestId, queryByTestId } = renderTab([tokenStyled], "a");
    // Mounts in token mode (the value is a token), so the custom input is hidden.
    expect(queryByTestId("style-control-color-custom")).toBeNull();
    fireEvent.click(getByTestId("style-control-color-mode-custom"));
    // The incompatible token is cleared and the raw input takes over.
    expect(getByTestId("style-control-color-custom")).toBeDefined();
    expect(getByTestId("style-probe").textContent).not.toContain('"color"');
  });

  test("offers no create item for a case-variant of a known property", () => {
    const { getByTestId, queryByTestId } = renderTab(
      [{ id: "a", name: "core/x" }],
      "a",
    );
    fireEvent.click(getByTestId("style-declaration-add-key"));
    fireEvent.change(getByTestId("style-declaration-add-key-search"), {
      target: { value: "margintop" },
    });
    // `margintop` collides with the curated `marginTop`, so no second creation.
    expect(queryByTestId("style-declaration-add-key-create")).toBeNull();
  });
});
