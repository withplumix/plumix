import type { ReactElement } from "react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import type { BlockNode, ThemeTokens } from "@plumix/blocks";

import { EditorProvider, useEditorStore } from "./provider.js";
import { StylesTab } from "./styles-tab.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});
afterEach(cleanup);

const tokens: ThemeTokens = {
  spacing: { lg: { value: "24px" }, sm: { value: "8px" } },
  fontFamily: { lg: { value: "20px" }, sm: { value: "14px" } },
  fontSize: { base: { value: "16px" } },
};

function StyleProbe({ id }: { readonly id: string }): ReactElement {
  const style = useEditorStore((s) => s.tree.find((n) => n.id === id)?.style);
  return <output data-testid="style-probe">{JSON.stringify(style)}</output>;
}

function renderTab(
  tree: readonly BlockNode[],
  activeId?: string,
  { expandCss = true }: { readonly expandCss?: boolean } = {},
) {
  const utils = render(
    <I18nProvider i18n={i18n}>
      <EditorProvider initialTree={tree}>
        <ActiveSeed activeId={activeId} />
        <StylesTab tokens={tokens} />
        <StyleProbe id={tree[0]?.id ?? ""} />
      </EditorProvider>
    </I18nProvider>,
  );
  // The raw-CSS "declarations" section is collapsed by default; open it so its
  // content is queryable. Tests asserting the default pass `expandCss: false`.
  if (activeId && expandCss) {
    fireEvent.click(utils.getByTestId("styles-section-declarations"));
  }
  return utils;
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

  test("writes a token style to the active desktop bucket", async () => {
    const user = userEvent.setup({ delay: null });
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    // Font family draws from the fontFamily token scale.
    await user.click(getByTestId("style-control-fontFamily-token"));
    await user.click(getByTestId("style-control-fontFamily-token-lg"));

    expect(getByTestId("style-probe").textContent).toContain(
      '"large":{"fontFamily":"var(--plumix-font-family-lg, 20px)"}',
    );
  });

  test("font-size draws from its own token scale, not the font-family bucket", async () => {
    const user = userEvent.setup({ delay: null });
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    // fontSize is now token-backed by its own scale (the conflation bug fix).
    await user.click(getByTestId("style-control-fontSize-token"));
    await user.click(getByTestId("style-control-fontSize-token-base"));

    expect(getByTestId("style-probe").textContent).toContain(
      '"fontSize":"var(--plumix-font-size-base, 16px)"',
    );
  });

  test("renders Margin and Padding as sibling cards, not nested", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");
    const margin = getByTestId("box-model-margin");
    const padding = getByTestId("box-model-padding");
    expect(margin.contains(padding)).toBe(false);
  });

  test("orders the sections to mirror Builder", () => {
    const { container } = renderTab([{ id: "a", name: "core/x" }], "a", {
      expandCss: false,
    });
    const sections = [
      ...container.querySelectorAll('[data-testid^="styles-section-"]'),
    ].map((el) => el.getAttribute("data-testid"));
    expect(sections).toEqual([
      "styles-section-layout",
      "styles-section-size",
      "styles-section-visibility",
      "styles-section-background",
      "styles-section-typography",
      "styles-section-spacing",
      "styles-section-border",
      "styles-section-effects",
      "styles-section-declarations",
      "styles-section-html",
      "styles-section-advanced",
    ]);
  });

  test("labels the spacing section 'Spacing' and declarations 'CSS Properties'", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a", {
      expandCss: false,
    });
    expect(getByTestId("styles-section-spacing").textContent).toContain(
      "Spacing",
    );
    expect(getByTestId("styles-section-declarations").textContent).toContain(
      "CSS Properties",
    );
  });

  test("leads with Layout, then Size as its own section", () => {
    const { container } = renderTab([{ id: "a", name: "core/x" }], "a", {
      expandCss: false,
    });
    const sections = [
      ...container.querySelectorAll('[data-testid^="styles-section-"]'),
    ].map((el) => el.getAttribute("data-testid"));
    expect(sections[0]).toBe("styles-section-layout");
    expect(sections[1]).toBe("styles-section-size");
  });

  test("the Layout section writes align-self for the block within its parent", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    fireEvent.click(getByTestId("style-alignSelf-center"));

    expect(getByTestId("style-probe").textContent).toContain(
      '"alignSelf":"center"',
    );
  });

  test("the Layout section writes display to node.style and reveals flex controls", () => {
    const { getByTestId, queryByTestId } = renderTab(
      [{ id: "a", name: "core/x" }],
      "a",
    );
    // Flex-only controls stay hidden until display is flex.
    expect(queryByTestId("style-flexDirection-row")).toBeNull();

    fireEvent.click(getByTestId("style-display-flex"));

    expect(getByTestId("style-probe").textContent).toContain(
      '"display":"flex"',
    );
    // Direction / justify / align now appear.
    expect(getByTestId("style-flexDirection-row")).toBeDefined();
    expect(getByTestId("style-justifyContent-center")).toBeDefined();
    expect(getByTestId("style-alignItems-stretch")).toBeDefined();
  });

  test("exposes a Size section that writes width/min-width", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    expect(getByTestId("styles-section-size")).toBeDefined();

    // Sizing has no token scale, so the custom input shows directly (no mode
    // toggle) — the same model as font-size.
    fireEvent.change(getByTestId("style-control-width-custom"), {
      target: { value: "280px" },
    });
    fireEvent.change(getByTestId("style-control-minWidth-custom"), {
      target: { value: "280px" },
    });

    const probe = getByTestId("style-probe").textContent;
    expect(probe).toContain('"width":"280px"');
    expect(probe).toContain('"minWidth":"280px"');
  });

  test("exposes a letter-spacing control that writes a custom value", () => {
    // letterSpacing now has a token scale, so it mounts in token mode; switch to
    // custom to type a raw value (Builder's Char Space).
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    fireEvent.click(getByTestId("style-control-letterSpacing-mode-custom"));
    fireEvent.change(getByTestId("style-control-letterSpacing-custom"), {
      target: { value: "0.05em" },
    });

    expect(getByTestId("style-probe").textContent).toContain(
      '"letterSpacing":"0.05em"',
    );
  });

  test("exposes a border-style select that writes borderStyle to the bucket", async () => {
    // Builder's Border "Style" is an enumerated dropdown, not free text — a
    // width alone renders nothing without a style, so this closes that gap.
    const user = userEvent.setup({ delay: null });
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    await user.click(getByTestId("style-control-borderStyle-select"));
    await user.click(getByTestId("style-control-borderStyle-option-dashed"));

    expect(getByTestId("style-probe").textContent).toContain(
      '"borderStyle":"dashed"',
    );
  });

  test("border-style writes an explicit none, distinct from clearing", async () => {
    const user = userEvent.setup({ delay: null });
    const styled: BlockNode = {
      id: "a",
      name: "core/x",
      style: { large: { borderStyle: "solid" } },
    };
    const { getByTestId } = renderTab([styled], "a");

    // The literal "none" keyword is a real value (border-style: none), not the
    // clear action — the "—" sentinel is what unsets the property.
    await user.click(getByTestId("style-control-borderStyle-select"));
    await user.click(getByTestId("style-control-borderStyle-option-none"));
    expect(getByTestId("style-probe").textContent).toContain(
      '"borderStyle":"none"',
    );

    await user.click(getByTestId("style-control-borderStyle-select"));
    await user.click(getByTestId("style-control-borderStyle-option-unset"));
    // Clearing the only property prunes the style slot to undefined.
    expect(getByTestId("style-probe").textContent).toBe("");
  });

  test("border Style and Color both span the full row (like Builder)", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");
    // Style (keyword select) and Color are full-width rows; Width + Radius pair
    // up below as half-width cells.
    expect(
      getByTestId("style-control-borderStyle").parentElement?.className,
    ).toContain("col-span-2");
    expect(
      getByTestId("style-control-borderColor").parentElement?.className,
    ).toContain("col-span-2");
  });

  test("the background color control spans the full row (no half-width gap)", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");
    // A lone control in a 2-col grid would leave the right half empty.
    expect(
      getByTestId("style-control-background").parentElement?.className,
    ).toContain("col-span-2");
  });

  test("opacity shows 1 as a placeholder when unset", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");
    expect(
      (getByTestId("style-control-opacity-input") as HTMLInputElement)
        .placeholder,
    ).toBe("1");
  });

  test("the Shadows & Effects section exposes an opacity control that writes opacity", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    expect(getByTestId("styles-section-effects").textContent).toContain(
      "Shadows & Effects",
    );

    // A numeric readout (0–1) drives the write; a synced slider is visual sugar.
    fireEvent.change(getByTestId("style-control-opacity-input"), {
      target: { value: "0.5" },
    });

    expect(getByTestId("style-probe").textContent).toContain('"opacity":"0.5"');
  });

  test("the text-shadow switch composes and clears a text-shadow value", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    // Enabling seeds a default composed shadow (x/y/blur/color).
    fireEvent.click(getByTestId("style-text-shadow-toggle"));
    expect(getByTestId("style-probe").textContent).toContain('"textShadow"');

    // Editing a part recomposes the whole value.
    fireEvent.change(getByTestId("style-text-shadow-blur"), {
      target: { value: "5" },
    });
    expect(getByTestId("style-probe").textContent).toContain("5px");

    // Clearing an offset field coalesces to 0 — never a malformed "px …".
    fireEvent.change(getByTestId("style-text-shadow-x"), {
      target: { value: "" },
    });
    expect(getByTestId("style-probe").textContent).toContain(
      '"textShadow":"0px',
    );
    expect(getByTestId("style-probe").textContent).not.toContain('"px');

    // Disabling clears the property entirely (slot prunes to undefined).
    fireEvent.click(getByTestId("style-text-shadow-toggle"));
    expect(getByTestId("style-probe").textContent).toBe("");
  });

  test("the Background section composes a background-image url from a URL input", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    fireEvent.change(getByTestId("style-control-backgroundImage-url"), {
      target: { value: "https://ex.com/a.png" },
    });
    expect(getByTestId("style-probe").textContent).toContain(
      '"backgroundImage":"url(\\"https://ex.com/a.png\\")"',
    );

    // Clearing the field removes the property (slot prunes to undefined).
    fireEvent.change(getByTestId("style-control-backgroundImage-url"), {
      target: { value: "" },
    });
    expect(getByTestId("style-probe").textContent).toBe("");
  });

  test("the Background image field reads the bare URL back out of a stored url()", () => {
    const styled: BlockNode = {
      id: "a",
      name: "core/x",
      style: { large: { backgroundImage: 'url("https://ex.com/a.png")' } },
    };
    const { getByTestId } = renderTab([styled], "a");
    // The field unwraps url("…") for editing rather than showing the wrapper.
    expect(
      (getByTestId("style-control-backgroundImage-url") as HTMLInputElement)
        .value,
    ).toBe("https://ex.com/a.png");
  });

  test("the italic mark toggles a fontStyle raw value", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    fireEvent.click(getByTestId("style-mark-italic"));

    expect(getByTestId("style-probe").textContent).toContain(
      '"fontStyle":"italic"',
    );
  });

  test("underline and strikethrough share textDecoration (mutually exclusive)", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    fireEvent.click(getByTestId("style-mark-underline"));
    expect(getByTestId("style-probe").textContent).toContain(
      '"textDecoration":"underline"',
    );

    // Strikethrough overwrites the shared property rather than accumulating.
    fireEvent.click(getByTestId("style-mark-strikethrough"));
    const probe = getByTestId("style-probe").textContent;
    expect(probe).toContain('"textDecoration":"line-through"');
    expect(probe).not.toContain("underline");
  });

  test("the align control writes a textAlign raw value", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    fireEvent.click(getByTestId("style-align-center"));

    expect(getByTestId("style-probe").textContent).toContain(
      '"textAlign":"center"',
    );
  });

  test("the text controls fit the rail (tightened padding) and carry tooltips", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");
    const controls = [
      "style-mark-bold",
      "style-mark-italic",
      "style-mark-underline",
      "style-mark-strikethrough",
      "style-align-left",
      "style-align-center",
      "style-align-right",
    ];

    for (const id of controls) {
      const button = getByTestId(id);
      expect(button.className).toContain("px-2");
      expect(button.getAttribute("aria-label")).toBeTruthy();
    }

    // Focusing a control opens its tooltip; Radix points the trigger's
    // aria-describedby at the content, which must echo the control's label.
    const bold = getByTestId("style-mark-bold");
    fireEvent.focus(bold);
    const tipId = bold.getAttribute("aria-describedby");
    expect(tipId).toBeTruthy();
    expect(document.getElementById(tipId ?? "")?.textContent).toBe(
      bold.getAttribute("aria-label"),
    );
  });

  test("the Visibility section hides on any device, not just the active one", () => {
    // Active device is desktop, but the Mobile switch writes display:none into
    // the small bucket directly — all three devices are editable at once.
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    fireEvent.click(getByTestId("style-visibility-mobile"));

    expect(getByTestId("style-probe").textContent).toContain(
      '"small":{"display":"none"}',
    );
  });

  test("a visibility switch reads checked from an existing display:none", () => {
    const hidden: BlockNode = {
      id: "a",
      name: "core/x",
      style: { large: { display: "none" } },
    };
    expect(
      renderTab([hidden], "a")
        .getByTestId("style-visibility-desktop")
        .getAttribute("data-state"),
    ).toBe("checked");
  });

  test("toggling a visibility switch off clears display:none for that bucket", () => {
    const hidden: BlockNode = {
      id: "a",
      name: "core/x",
      style: { large: { display: "none" } },
    };
    const { getByTestId } = renderTab([hidden], "a");

    fireEvent.click(getByTestId("style-visibility-desktop"));

    // The only declaration is gone, so the style slot prunes to undefined.
    expect(getByTestId("style-probe").textContent).toBe("");
  });

  test("box-model writes a per-side custom padding value", () => {
    const { getByTestId } = renderTab([{ id: "a", name: "core/x" }], "a");

    fireEvent.click(getByTestId("style-control-paddingTop-mode-custom"));
    fireEvent.change(getByTestId("style-control-paddingTop-custom"), {
      target: { value: "12px" },
    });

    expect(getByTestId("style-probe").textContent).toContain(
      '"paddingTop":"12px"',
    );
  });
});

describe("StylesTab — declarations list", () => {
  const styled: BlockNode = {
    id: "a",
    name: "core/x",
    style: { large: { color: "#0c2238" } },
  };

  test("keeps the CSS section collapsed by default (dev escape hatch)", () => {
    const { getByTestId, queryByTestId } = renderTab([styled], "a", {
      expandCss: false,
    });
    // The section trigger renders, but its content stays unmounted until opened.
    expect(getByTestId("styles-section-declarations")).toBeDefined();
    expect(queryByTestId("style-declaration-color-key")).toBeNull();
  });

  test("lists each declaration in the active bucket with its raw value", () => {
    const { getByTestId } = renderTab([styled], "a");
    const value = getByTestId(
      "style-declaration-color-value",
    ) as HTMLInputElement;
    expect(value.value).toBe("#0c2238");
  });

  test("renames a declaration's property via the key field on commit", () => {
    const { getByTestId } = renderTab([styled], "a");
    const key = getByTestId("style-declaration-color-key") as HTMLInputElement;
    fireEvent.change(key, { target: { value: "background" } });
    fireEvent.blur(key);
    expect(getByTestId("style-probe").textContent).toContain(
      '"background":"#0c2238"',
    );
    expect(getByTestId("style-probe").textContent).not.toContain('"color"');
  });

  test("reverts an invalid rename, leaving the property unchanged", () => {
    const { getByTestId } = renderTab([styled], "a");
    const key = getByTestId("style-declaration-color-key") as HTMLInputElement;
    fireEvent.change(key, { target: { value: "bad key!" } });
    fireEvent.blur(key);
    expect(getByTestId("style-probe").textContent).toContain('"color"');
    // The field snaps back to the original property name.
    expect(
      (getByTestId("style-declaration-color-key") as HTMLInputElement).value,
    ).toBe("color");
  });

  test("won't rename onto an existing property (no clobber)", () => {
    const twoProps: BlockNode = {
      id: "a",
      name: "core/x",
      style: { large: { color: "#333", background: "#fff" } },
    };
    const { getByTestId } = renderTab([twoProps], "a");
    const key = getByTestId("style-declaration-color-key") as HTMLInputElement;
    fireEvent.change(key, { target: { value: "background" } });
    fireEvent.blur(key);
    // Both originals survive; the collision is rejected.
    expect(getByTestId("style-probe").textContent).toContain('"color":"#333"');
    expect(getByTestId("style-probe").textContent).toContain(
      '"background":"#fff"',
    );
  });

  test("editing a declaration's value writes it back to the bucket", () => {
    const { getByTestId } = renderTab([styled], "a");
    fireEvent.change(getByTestId("style-declaration-color-value"), {
      target: { value: "rebeccapurple" },
    });
    expect(getByTestId("style-probe").textContent).toContain(
      '"color":"rebeccapurple"',
    );
  });

  test("clearing the value keeps the row (only the Trash button deletes)", () => {
    const { getByTestId } = renderTab([styled], "a");
    fireEvent.change(getByTestId("style-declaration-color-value"), {
      target: { value: "" },
    });
    // Row survives an empty value so retyping doesn't unmount the focused input.
    expect(getByTestId("style-declaration-color-value")).toBeDefined();
    expect(getByTestId("style-probe").textContent).toContain('"color":""');
  });

  test("removing a declaration clears the property", () => {
    const { getByTestId } = renderTab([styled], "a");
    fireEvent.click(getByTestId("style-declaration-color-remove"));
    // The only property is gone, so the style slot prunes to undefined.
    expect(getByTestId("style-probe").textContent).toBe("");
  });

  const fontToken: BlockNode = {
    id: "a",
    name: "core/x",
    style: { large: { fontFamily: "var(--plumix-font-family-lg)" } },
  };

  test("a token declaration renders a token picker, no raw value input", async () => {
    const user = userEvent.setup({ delay: null });
    const { getByTestId, queryByTestId } = renderTab([fontToken], "a");
    const picker = getByTestId("style-declaration-fontFamily-token");
    // The trigger shows the chosen token as its emitted var(), not a literal.
    expect(picker.textContent).toContain("var(--plumix-font-family-lg)");
    // The category's tokens are the options; raw input is absent for a token row.
    await user.click(picker);
    expect(getByTestId("style-declaration-fontFamily-token-lg")).toBeDefined();
    expect(getByTestId("style-declaration-fontFamily-token-sm")).toBeDefined();
    expect(queryByTestId("style-declaration-fontFamily-value")).toBeNull();
  });

  test("changing the token picker writes the new token", async () => {
    const user = userEvent.setup({ delay: null });
    const { getByTestId } = renderTab([fontToken], "a");
    await user.click(getByTestId("style-declaration-fontFamily-token"));
    await user.click(getByTestId("style-declaration-fontFamily-token-sm"));
    expect(getByTestId("style-probe").textContent).toContain(
      '"fontFamily":"var(--plumix-font-family-sm, 14px)"',
    );
  });

  test("keeps an unknown token visible and selected in the picker", () => {
    const ghost: BlockNode = {
      id: "a",
      name: "core/x",
      style: { large: { fontFamily: "var(--plumix-font-family-ghost)" } },
    };
    const { getByTestId } = renderTab([ghost], "a");
    // "ghost" isn't in the theme, but the trigger still shows it (not blank).
    expect(
      getByTestId("style-declaration-fontFamily-token").textContent,
    ).toContain("var(--plumix-font-family-ghost)");
  });

  test("clearing the token picker removes the declaration", async () => {
    const user = userEvent.setup({ delay: null });
    const { getByTestId } = renderTab([fontToken], "a");
    await user.click(getByTestId("style-declaration-fontFamily-token"));
    await user.click(getByTestId("style-declaration-fontFamily-token-none"));
    expect(getByTestId("style-probe").textContent).toBe("");
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
      '"letterSpacing":"0.05em"',
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
      '"scrollSnapAlign":"start"',
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
      '"marginTop":"8px"',
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
      style: { large: { color: "var(--plumix-color-lg)" } },
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

function NodeProbe({ id }: { readonly id: string }): ReactElement {
  const attrs = useEditorStore(
    (s) => s.tree.find((n) => n.id === id)?.htmlAttrs,
  );
  const tagName = useEditorStore(
    (s) => s.tree.find((n) => n.id === id)?.tagName,
  );
  const className = useEditorStore(
    (s) => s.tree.find((n) => n.id === id)?.className,
  );
  return (
    <>
      <output data-testid="html-attr-probe">{JSON.stringify(attrs)}</output>
      <output data-testid="tag-name-probe">{tagName ?? ""}</output>
      <output data-testid="class-name-probe">{className ?? ""}</output>
    </>
  );
}

function renderNodeSection(
  tree: readonly BlockNode[],
  activeId: string,
  section: "html" | "advanced" = "html",
) {
  const utils = render(
    <I18nProvider i18n={i18n}>
      <EditorProvider initialTree={tree}>
        <ActiveSeed activeId={activeId} />
        <StylesTab tokens={tokens} />
        <NodeProbe id={tree[0]?.id ?? ""} />
      </EditorProvider>
    </I18nProvider>,
  );
  // The HTML attributes / Advanced sections are collapsed by default — open one.
  fireEvent.click(utils.getByTestId(`styles-section-${section}`));
  return utils;
}

describe("StylesTab — HTML attributes & tag name", () => {
  const withAttrs: BlockNode = {
    id: "a",
    name: "core/x",
    htmlAttrs: { id: "hero", "data-track": "cta" },
  };

  test("the tag-name select overrides the block's root element", async () => {
    const user = userEvent.setup({ delay: null });
    const { getByTestId } = renderNodeSection(
      [{ id: "a", name: "core/group" }],
      "a",
    );

    await user.click(getByTestId("block-tag-name-select"));
    await user.click(getByTestId("block-tag-name-option-section"));

    expect(getByTestId("tag-name-probe").textContent).toBe("section");
  });

  test("a non-allowlisted stored tag-name presents as Default (matches render)", () => {
    const { getByTestId } = renderNodeSection(
      [{ id: "a", name: "core/group", tagName: "span" }],
      "a",
    );
    expect(getByTestId("block-tag-name-select").textContent).toBe("Default");
  });

  test("resetting the tag-name to Default clears the override", async () => {
    const user = userEvent.setup({ delay: null });
    const { getByTestId } = renderNodeSection(
      [{ id: "a", name: "core/group", tagName: "nav" }],
      "a",
    );

    await user.click(getByTestId("block-tag-name-select"));
    await user.click(getByTestId("block-tag-name-option-default"));

    expect(getByTestId("tag-name-probe").textContent).toBe("");
  });

  test("the HTML attributes section is collapsed by default", () => {
    const { getByTestId, queryByTestId } = render(
      <I18nProvider i18n={i18n}>
        <EditorProvider initialTree={[withAttrs]}>
          <ActiveSeed activeId="a" />
          <StylesTab tokens={tokens} />
        </EditorProvider>
      </I18nProvider>,
    );
    expect(getByTestId("styles-section-html")).toBeDefined();
    expect(queryByTestId("html-attr-id-key")).toBeNull();
  });

  test("lists existing attributes as editable key/value rows", () => {
    const { getByTestId } = renderNodeSection([withAttrs], "a");
    expect((getByTestId("html-attr-id-key") as HTMLInputElement).value).toBe(
      "id",
    );
    expect((getByTestId("html-attr-id-value") as HTMLInputElement).value).toBe(
      "hero",
    );
  });

  test("editing a value writes it back to the block", () => {
    const { getByTestId } = renderNodeSection([withAttrs], "a");
    fireEvent.change(getByTestId("html-attr-id-value"), {
      target: { value: "main" },
    });
    expect(getByTestId("html-attr-probe").textContent).toContain('"id":"main"');
  });

  test("adds an attribute via the combobox and value", () => {
    const { getByTestId } = renderNodeSection(
      [{ id: "a", name: "core/x" }],
      "a",
    );
    fireEvent.click(getByTestId("html-attr-add-key"));
    fireEvent.click(getByTestId("html-attr-add-key-option-role"));
    fireEvent.change(getByTestId("html-attr-add-value"), {
      target: { value: "banner" },
    });
    fireEvent.click(getByTestId("html-attr-add-submit"));
    expect(getByTestId("html-attr-probe").textContent).toContain(
      '"role":"banner"',
    );
  });

  test("renames an attribute via the key field on commit", () => {
    const { getByTestId } = renderNodeSection([withAttrs], "a");
    const key = getByTestId("html-attr-id-key") as HTMLInputElement;
    fireEvent.change(key, { target: { value: "title" } });
    fireEvent.blur(key);
    expect(getByTestId("html-attr-probe").textContent).toContain(
      '"title":"hero"',
    );
    expect(getByTestId("html-attr-probe").textContent).not.toContain('"id"');
  });

  test("removing an attribute clears it", () => {
    const single: BlockNode = {
      id: "a",
      name: "core/x",
      htmlAttrs: { id: "hero" },
    };
    const { getByTestId } = renderNodeSection([single], "a");
    fireEvent.click(getByTestId("html-attr-id-remove"));
    expect(getByTestId("html-attr-probe").textContent).toBe("");
  });

  test("offers no create item for a disallowed attribute name", () => {
    const { getByTestId, queryByTestId } = renderNodeSection(
      [{ id: "a", name: "core/x" }],
      "a",
    );
    fireEvent.click(getByTestId("html-attr-add-key"));
    fireEvent.change(getByTestId("html-attr-add-key-search"), {
      target: { value: "onclick" },
    });
    // The allowlist rejects event handlers — no create item (XSS boundary).
    expect(queryByTestId("html-attr-add-key-create")).toBeNull();
  });

  test("normalizes a typed key to lowercase so the renderer keeps it", () => {
    const { getByTestId } = renderNodeSection(
      [{ id: "a", name: "core/x" }],
      "a",
    );
    fireEvent.click(getByTestId("html-attr-add-key"));
    fireEvent.change(getByTestId("html-attr-add-key-search"), {
      target: { value: "Data-Track" },
    });
    fireEvent.click(getByTestId("html-attr-add-key-create"));
    fireEvent.change(getByTestId("html-attr-add-value"), {
      target: { value: "cta" },
    });
    fireEvent.click(getByTestId("html-attr-add-submit"));
    expect(getByTestId("html-attr-probe").textContent).toContain(
      '"data-track":"cta"',
    );
  });

  test("won't add a case-variant of an existing attribute", () => {
    const { getByTestId, queryByTestId } = renderNodeSection([withAttrs], "a");
    fireEvent.click(getByTestId("html-attr-add-key"));
    fireEvent.change(getByTestId("html-attr-add-key-search"), {
      target: { value: "DATA-TRACK" },
    });
    // `data-track` already exists, so no create item for its uppercase variant.
    expect(queryByTestId("html-attr-add-key-create")).toBeNull();
  });
});

describe("StylesTab — Advanced", () => {
  test("the CSS classes field writes author className to the block", () => {
    const { getByTestId } = renderNodeSection(
      [{ id: "a", name: "core/x" }],
      "a",
      "advanced",
    );
    fireEvent.change(getByTestId("style-css-classes"), {
      target: { value: "hero big" },
    });
    expect(getByTestId("class-name-probe").textContent).toBe("hero big");
  });

  test("shows the block id as a read-only field", () => {
    const { getByTestId } = renderNodeSection(
      [{ id: "block-42", name: "core/x" }],
      "block-42",
      "advanced",
    );
    const input = getByTestId("style-block-id") as HTMLInputElement;
    expect(input.value).toBe("block-42");
    expect(input.readOnly).toBe(true);
  });

  test("the Advanced section is collapsed by default", () => {
    const { getByTestId, queryByTestId } = render(
      <I18nProvider i18n={i18n}>
        <EditorProvider initialTree={[{ id: "a", name: "core/x" }]}>
          <ActiveSeed activeId="a" />
          <StylesTab tokens={tokens} />
        </EditorProvider>
      </I18nProvider>,
    );
    expect(getByTestId("styles-section-advanced")).toBeDefined();
    expect(queryByTestId("style-css-classes")).toBeNull();
  });
});
