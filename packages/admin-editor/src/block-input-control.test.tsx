import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { BlockInput } from "@plumix/blocks";

import { BlockInputControl } from "./block-input-control.js";

beforeAll(() => {
  i18n.loadAndActivate({ locale: "en", messages: {} });
});

afterEach(cleanup);

function renderControl(input: BlockInput, value: unknown, onChange = vi.fn()) {
  const utils = render(
    <I18nProvider i18n={i18n}>
      <BlockInputControl input={input} value={value} onChange={onChange} />
    </I18nProvider>,
  );
  return { ...utils, onChange };
}

describe("BlockInputControl", () => {
  test("text input renders the value and emits edits", () => {
    const { getByTestId, onChange } = renderControl(
      { name: "text", type: "text", label: "Heading" },
      "Hello",
    );
    const control = getByTestId("block-input-text") as HTMLInputElement;
    expect(control.value).toBe("Hello");

    fireEvent.change(control, { target: { value: "World" } });
    expect(onChange).toHaveBeenCalledWith("World");
  });

  test("textarea renders the value and emits edits", () => {
    const { getByTestId, onChange } = renderControl(
      { name: "body", type: "textarea" },
      "one",
    );
    fireEvent.change(getByTestId("block-input-body"), {
      target: { value: "two" },
    });
    expect(onChange).toHaveBeenCalledWith("two");
  });

  test("number input emits a numeric value, null when cleared", () => {
    const { getByTestId, onChange } = renderControl(
      { name: "level", type: "number" },
      2,
    );
    const control = getByTestId("block-input-level") as HTMLInputElement;
    expect(control.value).toBe("2");

    fireEvent.change(control, { target: { value: "3" } });
    expect(onChange).toHaveBeenCalledWith(3);

    fireEvent.change(control, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  test("checkbox reflects a boolean and emits a boolean", () => {
    const { getByTestId, onChange } = renderControl(
      { name: "wide", type: "checkbox" },
      false,
    );
    fireEvent.click(getByTestId("block-input-wide"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  test("boolean renders a switch that reflects and emits a boolean", () => {
    const { getByTestId, onChange } = renderControl(
      { name: "reverse", type: "boolean" },
      false,
    );
    const control = getByTestId("block-input-reverse");
    // A Switch (role=switch), not a text input, per the on/off control rule.
    expect(control.getAttribute("role")).toBe("switch");
    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  test("select preserves a numeric option value through the round trip", () => {
    const { getByTestId, onChange } = renderControl(
      {
        name: "level",
        type: "select",
        options: [
          { label: "H2", value: 2 },
          { label: "H3", value: 3 },
        ],
      },
      2,
    );
    const control = getByTestId("block-input-level") as HTMLSelectElement;
    expect(control.value).toBe("2");

    fireEvent.change(control, { target: { value: "3" } });
    // Emits the number 3, not the string "3".
    expect(onChange).toHaveBeenCalledWith(3);
  });

  test("select preserves a boolean option value through the round trip", () => {
    const { getByTestId, onChange } = renderControl(
      {
        name: "wide",
        type: "select",
        options: [
          { label: "Yes", value: true },
          { label: "No", value: false },
        ],
      },
      false,
    );
    fireEvent.change(getByTestId("block-input-wide"), {
      target: { value: "true" },
    });
    // Emits the boolean true, not the string "true".
    expect(onChange).toHaveBeenCalledWith(true);
  });

  test("number input clears to null on an unparseable value", () => {
    const { getByTestId, onChange } = renderControl(
      { name: "level", type: "number" },
      2,
    );
    fireEvent.change(getByTestId("block-input-level"), {
      target: { value: "" },
    });
    // Never emits NaN — empty/unparseable clears to null.
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  test("radio selects an option and emits its typed value", () => {
    const { getByTestId, onChange } = renderControl(
      {
        name: "align",
        type: "radio",
        options: [
          { label: "Left", value: "left" },
          { label: "Right", value: "right" },
        ],
      },
      "left",
    );
    fireEvent.click(getByTestId("block-input-align-right"));
    expect(onChange).toHaveBeenCalledWith("right");
  });

  test("combobox is free-text with option suggestions", () => {
    const { getByTestId, onChange } = renderControl(
      {
        name: "tag",
        type: "combobox",
        options: [{ label: "News", value: "news" }],
      },
      "",
    );
    fireEvent.change(getByTestId("block-input-tag"), {
      target: { value: "custom" },
    });
    expect(onChange).toHaveBeenCalledWith("custom");
  });

  // The Tiptap + ProseMirror lazy chunk is heavy; under a loaded CI box it can
  // resolve past the 1s findBy default. Raise the findBy margin to 5s and the
  // test timeout above it, so a real failure surfaces the informative findBy
  // error instead of racing vitest's (default 5s) test timeout.
  test(
    "richtext lazy-loads the Tiptap toolbar and editable surface",
    { timeout: 15_000 },
    async () => {
      const { findByTestId, getByTestId, onChange } = renderControl(
        { name: "body", type: "richtext", label: "Body" },
        "<p>Hello</p>",
      );
      // The editor (Tiptap + ProseMirror) is a lazy chunk; the skeleton shows
      // until it resolves, then the toolbar + contenteditable surface mount.
      expect(getByTestId("block-input-body-loading")).toBeDefined();
      expect(
        await findByTestId("block-input-body-bold", undefined, {
          timeout: 5000,
        }),
      ).toBeDefined();
      expect(getByTestId("block-input-body-clear")).toBeDefined();
      // Marks defined in the schema but previously unreachable now have toggles.
      expect(getByTestId("block-input-body-code")).toBeDefined();
      expect(getByTestId("block-input-body-subscript")).toBeDefined();
      expect(getByTestId("block-input-body-superscript")).toBeDefined();
      // The contenteditable surface can mount a tick after the toolbar, so
      // await it rather than reading it synchronously (a CI-only race).
      const editor = await findByTestId("block-input-body-editor");
      expect(editor.getAttribute("contenteditable")).toBe("true");
      expect(editor.textContent).toContain("Hello");

      // Quotes are folded in too: the blockquote toggle wraps the block.
      // Asserted before the format dropdown — opening the Radix Select portal
      // steals the editor selection, so exercise the editor toggles first.
      fireEvent.click(getByTestId("block-input-body-blockquote"));
      expect(onChange).toHaveBeenCalledWith(
        expect.stringContaining("<blockquote"),
      );

      // Headings are inline formats of the unified rich-text block: the format
      // dropdown reflects the current block and converts it on change.
      const user = userEvent.setup({ delay: null });
      const format = getByTestId("block-input-body-format");
      expect(format.textContent).toContain("Paragraph");
      await user.click(format);
      await user.click(getByTestId("block-input-body-format-h2"));
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining("<h2"));
    },
  );

  test("falls back to a text input for an unknown kind", () => {
    const { getByTestId } = renderControl(
      { name: "mystery", type: "future-kind" },
      "x",
    );
    expect(getByTestId("block-input-mystery")).toBeDefined();
  });

  test("renders a host-resolved plugin field for an unknown kind and forwards edits", () => {
    const onChange = vi.fn();
    // A plugin control reads rhf.value and emits a composite value — proving
    // the seam forwards a plugin-shaped value straight back to the block attr.
    const StubField = ({
      rhf,
      testId,
    }: {
      readonly rhf: {
        readonly value: unknown;
        readonly onChange: (v: unknown) => void;
      };
      readonly testId: string;
    }) => (
      <input
        data-testid={testId}
        data-plugin="stub"
        value={typeof rhf.value === "string" ? rhf.value : ""}
        onChange={(e) => rhf.onChange({ id: e.target.value })}
      />
    );
    const resolve = (type: string) =>
      type === "media" ? StubField : undefined;

    const { getByTestId } = render(
      <I18nProvider i18n={i18n}>
        <BlockInputControl
          input={{ name: "image", type: "media" }}
          value="seed"
          onChange={onChange}
          resolvePluginFieldType={resolve}
        />
      </I18nProvider>,
    );

    const control = getByTestId("block-input-image");
    expect(control.getAttribute("data-plugin")).toBe("stub");
    fireEvent.change(control, { target: { value: "42" } });
    expect(onChange).toHaveBeenCalledWith({ id: "42" });
  });

  test("forwards the block's sibling attrs to a plugin control", () => {
    // A sibling-aware control (the focal-point picker) reads other block attrs
    // — e.g. the image url — off `attrs`.
    const SiblingField = ({
      testId,
      attrs,
    }: {
      readonly testId: string;
      readonly attrs?: Readonly<Record<string, unknown>>;
    }) => <span data-testid={testId} data-src={String(attrs?.src)} />;
    const { getByTestId } = render(
      <I18nProvider i18n={i18n}>
        <BlockInputControl
          input={{ name: "focalPoint", type: "focalPoint" }}
          value={{ x: 0.5, y: 0.5 }}
          onChange={vi.fn()}
          attrs={{ src: "/photo.jpg", alt: "x" }}
          resolvePluginFieldType={(t) =>
            t === "focalPoint" ? SiblingField : undefined
          }
        />
      </I18nProvider>,
    );
    expect(getByTestId("block-input-focalPoint").getAttribute("data-src")).toBe(
      "/photo.jpg",
    );
  });

  test("still falls back to text when no resolver matches the unknown kind", () => {
    const { getByTestId } = render(
      <I18nProvider i18n={i18n}>
        <BlockInputControl
          input={{ name: "mystery", type: "future-kind" }}
          value="x"
          onChange={vi.fn()}
          resolvePluginFieldType={() => undefined}
        />
      </I18nProvider>,
    );
    const control = getByTestId("block-input-mystery") as HTMLInputElement;
    expect(control.getAttribute("data-plugin")).toBeNull();
    expect(control.value).toBe("x");
  });

  test("uses the input name as the label when none is given", () => {
    const { getByText } = renderControl({ name: "slug", type: "text" }, "");
    expect(getByText("slug")).toBeDefined();
  });
});
