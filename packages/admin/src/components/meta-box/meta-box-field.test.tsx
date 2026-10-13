import type { I18n } from "@lingui/core";
import type { ReactNode } from "react";
import {
  _resetPluginRegistry,
  registerPluginFieldType,
} from "@/lib/plugin-registry.js";
import { createQueryClient } from "@/providers/query-client.js";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";
import { Form } from "@plumix/admin-ui/form";

import { MetaBoxField } from "./meta-box-field.js";

afterEach(() => {
  vi.restoreAllMocks();
  _resetPluginRegistry();
});

function field(
  overrides: Partial<MetaBoxFieldManifestEntry> & { inputType: string },
): MetaBoxFieldManifestEntry {
  return { key: "k", label: "Label", type: "string", ...overrides };
}

function Harness({
  fieldDef,
  initial,
}: {
  fieldDef: MetaBoxFieldManifestEntry;
  initial: unknown;
}): ReactNode {
  const form = useForm<Record<string, unknown>>({
    defaultValues: { [fieldDef.key]: initial },
  });
  return (
    <Form {...form}>
      <MetaBoxField field={fieldDef} name={fieldDef.key} />
    </Form>
  );
}

function englishI18n(): I18n {
  return setupI18n({ locale: "en", messages: { en: {} } });
}

function render(
  fieldDef: MetaBoxFieldManifestEntry,
  initial: unknown,
  i18n: I18n = englishI18n(),
): string {
  return renderToStaticMarkup(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={createQueryClient()}>
        <Harness fieldDef={fieldDef} initial={initial} />
      </QueryClientProvider>
    </I18nProvider>,
  );
}

/** The opening tag of the element carrying `testId`, or `undefined`. */
function tagOf(html: string, testId: string): string | undefined {
  return new RegExp(`<[^<>]*data-testid="${testId}"[^<>]*>`).exec(html)?.[0];
}

/** The text inside the element carrying `testId`, tags stripped. */
function textOf(html: string, testId: string): string | undefined {
  const match = new RegExp(
    `data-testid="${testId}"[^<>]*>(.*?)</(?:span|p|button|label|div)>`,
  ).exec(html);
  return match?.[1]?.split(/<[^>]*>/).join("");
}

function attrOf(tag: string | undefined, attr: string): string | undefined {
  return tag === undefined
    ? undefined
    : new RegExp(`\\s${attr}="([^"]*)"`).exec(tag)?.[1];
}

describe("MetaBoxField built-in inputs", () => {
  test("text renders a text input with its placeholder", () => {
    const input = tagOf(
      render(field({ inputType: "text", placeholder: "Type here" }), ""),
      "meta-box-field-k-input",
    );
    expect(input).toMatch(/^<input/);
    expect(attrOf(input, "type")).toBe("text");
    expect(attrOf(input, "placeholder")).toBe("Type here");
  });

  test("textarea renders a textarea holding the stored value, capped at its maxLength", () => {
    const html = render(
      field({ inputType: "textarea", maxLength: 50 }),
      "existing",
    );
    const textarea = tagOf(html, "meta-box-field-k-input");
    expect(textarea).toMatch(/^<textarea/);
    expect(attrOf(textarea, "maxLength")).toBe("50");
    expect(html).toMatch(
      /data-testid="meta-box-field-k-input"[^>]*>existing<\/textarea>/,
    );
  });

  test("password renders a masked input without the unknown-type warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const input = tagOf(
      render(
        field({ inputType: "password", placeholder: "••••••", maxLength: 64 }),
        "",
      ),
      "meta-box-field-k-input",
    );
    expect(attrOf(input, "type")).toBe("password");
    expect(attrOf(input, "placeholder")).toBe("••••••");
    expect(attrOf(input, "maxLength")).toBe("64");
    expect(warn).not.toHaveBeenCalled();
  });

  test("range shows the stored value beside its slider", () => {
    const html = render(
      field({ inputType: "range", min: 0, max: 100, step: 5 }),
      20,
    );
    expect(tagOf(html, "meta-box-field-k-input-slider")).toBeDefined();
    expect(textOf(html, "meta-box-field-k-input-display")).toBe("20");
  });

  test("a description renders under the field and describes the input", () => {
    const html = render(
      field({ inputType: "text", description: "Help text" }),
      "",
    );
    const description = tagOf(html, "meta-box-field-k-description");
    expect(textOf(html, "meta-box-field-k-description")).toBe("Help text");
    expect(
      attrOf(tagOf(html, "meta-box-field-k-input"), "aria-describedby")?.split(
        " ",
      ),
    ).toContain(attrOf(description, "id"));
  });

  test("a required field marks its native input required", () => {
    expect(
      tagOf(
        render(field({ inputType: "text", required: true }), ""),
        "meta-box-field-k-input",
      ),
    ).toMatch(/\srequired=""/);
  });

  test("an unknown inputType falls back to a text input and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const input = tagOf(
      render(field({ inputType: "mystery" }), ""),
      "meta-box-field-k-input",
    );
    expect(attrOf(input, "type")).toBe("text");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('unknown meta-box field inputType "mystery"'),
    );
  });

  test("a registered plugin inputType renders the plugin's component", () => {
    registerPluginFieldType("custom-stub", ({ field: f, testId }) => (
      <span data-testid={`${testId}-plugin`}>plugin:{f.inputType}</span>
    ));
    expect(
      textOf(
        render(field({ inputType: "custom-stub" }), "value"),
        "meta-box-field-k-input-plugin",
      ),
    ).toBe("plugin:custom-stub");
  });

  test("select buttons with nothing stored highlight no option", () => {
    const html = render(
      field({
        inputType: "select",
        appearance: "buttons",
        options: [
          { value: "a", label: "Alpha" },
          { value: "b", label: "Bravo" },
        ],
      }),
      undefined,
    );
    expect(
      attrOf(tagOf(html, "meta-box-field-k-input-a"), "aria-checked"),
    ).toBe("false");
    expect(
      attrOf(tagOf(html, "meta-box-field-k-input-b"), "aria-checked"),
    ).toBe("false");
  });
});

describe("MetaBoxField colour input", () => {
  test("the swatch and the hex input show the stored colour, and the label names the hex input", () => {
    const html = render(field({ inputType: "color" }), "#1a2b3c");
    const hex = tagOf(html, "meta-box-field-k-input-hex");
    expect(attrOf(tagOf(html, "meta-box-field-k-input-swatch"), "style")).toBe(
      "--swatch:#1a2b3c",
    );
    expect(attrOf(hex, "value")).toBe("#1a2b3c");
    expect(attrOf(hex, "id")).toBe(
      attrOf(/<label[^>]*data-slot="form-label"[^>]*>/.exec(html)?.[0], "for"),
    );
  });

  test("the swatch trigger's accessible name comes from the active catalog", () => {
    const de = setupI18n({
      locale: "de",
      messages: {
        de: { "metaBox.field.color.openPicker": "Farbwähler öffnen" },
      },
    });
    expect(
      attrOf(
        tagOf(
          render(field({ inputType: "color" }), "#1a2b3c", de),
          "meta-box-field-k-input-swatch",
        ),
        "aria-label",
      ),
    ).toBe("Farbwähler öffnen");
  });
});

describe("MetaBoxField reference pickers", () => {
  test("an empty user reference says none is selected and offers Select", () => {
    const html = render(
      field({
        inputType: "user",
        referenceTarget: { kind: "user", scope: { roles: ["admin"] } },
      }),
      null,
    );
    expect(textOf(html, "meta-box-field-k-input-empty")).toBe("None selected");
    expect(textOf(html, "meta-box-field-k-input-open")).toBe("Select");
  });

  test("a required, populated user reference offers no Clear", () => {
    const html = render(
      field({
        inputType: "user",
        required: true,
        referenceTarget: { kind: "user" },
      }),
      "42",
    );
    expect(tagOf(html, "meta-box-field-k-input-clear")).toBeUndefined();
  });

  test("an empty multi reference offers Select and counts against its max", () => {
    const html = render(
      field({
        inputType: "userList",
        type: "json",
        referenceTarget: { kind: "user", multiple: true },
        max: 3,
      }),
      [],
    );
    expect(textOf(html, "meta-box-field-k-input-empty")).toBe("None selected");
    expect(textOf(html, "meta-box-field-k-input-add")).toBe("Select");
    expect(textOf(html, "meta-box-field-k-input-count")).toBe("0 / 3");
  });

  test("a multi reference at its max offers a disabled Add", () => {
    const html = render(
      field({
        inputType: "userList",
        type: "json",
        referenceTarget: { kind: "user", multiple: true },
        max: 2,
      }),
      ["1", "2"],
    );
    const add = tagOf(html, "meta-box-field-k-input-add");
    expect(textOf(html, "meta-box-field-k-input-add")).toBe("Add");
    expect(add).toMatch(/\sdisabled=""/);
    expect(textOf(html, "meta-box-field-k-input-count")).toBe("2 / 2");
  });
});

describe("MetaBoxField sortable rows", () => {
  // English renders "Reorder" / "Remove" for both pickers, so only a catalog
  // with a distinct string per id catches a caller that swaps or drops one.
  function germanSortableI18n(): I18n {
    return setupI18n({
      locale: "de",
      messages: {
        de: {
          "metaBox.repeater.reorderRow": "Zeile verschieben",
          "metaBox.repeater.removeRow": "Zeile entfernen",
          "metaBox.multiReference.reorder": "Verweis verschieben",
          "metaBox.multiReference.remove": "Verweis entfernen",
        },
      },
    });
  }

  test("a repeater row's handle and remove button are named from the active catalog", () => {
    const html = render(
      field({
        key: "links",
        type: "json",
        inputType: "repeater",
        subFields: [
          { key: "label", label: "Label", type: "string", inputType: "text" },
        ],
      }),
      [{ label: "One" }, { label: "Two" }],
      germanSortableI18n(),
    );
    expect(
      attrOf(
        tagOf(html, "meta-box-field-links-input-list-row-0-handle"),
        "aria-label",
      ),
    ).toBe("Zeile verschieben");
    expect(
      attrOf(
        tagOf(html, "meta-box-field-links-input-list-row-0-remove"),
        "aria-label",
      ),
    ).toBe("Zeile entfernen");
  });

  test("a multi reference row's handle and remove button are named from the active catalog", () => {
    const html = render(
      field({
        inputType: "userList",
        type: "json",
        referenceTarget: { kind: "user", multiple: true },
      }),
      [
        { id: "1", name: "Ada", slug: "ada", avatarUrl: null },
        { id: "2", name: "Bo", slug: "bo", avatarUrl: null },
      ],
      germanSortableI18n(),
    );
    expect(
      attrOf(
        tagOf(html, "meta-box-field-k-input-list-row-1-handle"),
        "aria-label",
      ),
    ).toBe("Verweis verschieben");
    expect(
      attrOf(
        tagOf(html, "meta-box-field-k-input-list-row-1-remove"),
        "aria-label",
      ),
    ).toBe("Verweis entfernen");
  });
});

describe("MetaBoxField repeater", () => {
  function repeaterField(
    overrides?: Partial<MetaBoxFieldManifestEntry>,
  ): MetaBoxFieldManifestEntry {
    return field({
      key: "links",
      label: "Links",
      type: "json",
      inputType: "repeater",
      subFields: [
        { key: "label", label: "Label", type: "string", inputType: "text" },
        { key: "href", label: "URL", type: "string", inputType: "url" },
      ],
      ...overrides,
    });
  }

  test("no stored rows shows the empty placeholder and an Add row button", () => {
    const html = render(repeaterField(), undefined);
    expect(textOf(html, "meta-box-field-links-input-empty")).toBe("No rows");
    expect(textOf(html, "meta-box-field-links-input-add")).toBe("Add row");
  });

  test("a repeater at its max disables Add", () => {
    expect(
      tagOf(
        render(repeaterField({ max: 1 }), [{ label: "", href: "" }]),
        "meta-box-field-links-input-add",
      ),
    ).toMatch(/\sdisabled=""/);
  });

  test("the count shows the rows against the min and max", () => {
    expect(
      textOf(
        render(repeaterField({ min: 1, max: 3 }), [
          { label: "", href: "" },
          { label: "", href: "" },
        ]),
        "meta-box-field-links-input-count",
      ),
    ).toBe("2 / min 1 / max 3");
  });
});

describe("MetaBoxField group", () => {
  test("each member renders through the dispatcher", () => {
    const html = render(
      field({
        key: "seo",
        label: "SEO",
        type: "json",
        inputType: "group",
        subFields: [
          { key: "title", label: "Title", type: "string", inputType: "text" },
          {
            key: "description",
            label: "Description",
            type: "string",
            inputType: "textarea",
          },
        ],
      }),
      { title: "", description: "" },
    );
    expect(tagOf(html, "meta-box-field-title-input")).toMatch(/^<input/);
    expect(tagOf(html, "meta-box-field-description-input")).toMatch(
      /^<textarea/,
    );
  });

  test("a condition-hidden member does not render", () => {
    const html = render(
      field({
        key: "seo",
        label: "SEO",
        type: "json",
        inputType: "group",
        subFields: [
          { key: "kind", label: "Kind", type: "string", inputType: "text" },
          {
            key: "choices",
            label: "Choices",
            type: "string",
            inputType: "text",
            visibleWhen: [[{ key: "kind", op: "eq", value: "select" }]],
          },
        ],
      }),
      { kind: "text" },
    );
    expect(tagOf(html, "meta-box-field-kind-input")).toBeDefined();
    expect(tagOf(html, "meta-box-field-choices-input")).toBeUndefined();
  });
});

describe("MetaBoxField adornments", () => {
  test.each(["text", "email", "url", "password", "number"])(
    "%s: the prepend renders before the input and the append after it",
    (inputType) => {
      const html = render(
        field({ inputType, prepend: "$", append: "kg" }),
        null,
      );
      const prepend = html.indexOf(
        'data-testid="meta-box-field-k-input-prepend"',
      );
      const input = html.indexOf('data-testid="meta-box-field-k-input"');
      const append = html.indexOf(
        'data-testid="meta-box-field-k-input-append"',
      );
      expect(textOf(html, "meta-box-field-k-input-prepend")).toBe("$");
      expect(textOf(html, "meta-box-field-k-input-append")).toBe("kg");
      expect(prepend).toBeGreaterThan(-1);
      expect(prepend).toBeLessThan(input);
      expect(input).toBeLessThan(append);
    },
  );

  test("textarea: the prepend is a strip above the text and the append one below", () => {
    const html = render(
      field({ inputType: "textarea", prepend: "Intro", append: "Outro" }),
      "",
    );
    expect(
      attrOf(tagOf(html, "meta-box-field-k-input-prepend"), "data-align"),
    ).toBe("block-start");
    expect(
      attrOf(tagOf(html, "meta-box-field-k-input-append"), "data-align"),
    ).toBe("block-end");
  });

  test("a stored value renders unchanged in an adorned input", () => {
    expect(
      attrOf(
        tagOf(
          render(field({ inputType: "text", prepend: "$", append: "kg" }), "5"),
          "meta-box-field-k-input",
        ),
        "value",
      ),
    ).toBe("5");
  });

  test("a field with neither key renders no input group", () => {
    expect(render(field({ inputType: "text" }), "")).not.toContain(
      'data-slot="input-group"',
    );
  });

  test("an adorned input keeps its label and description wiring", () => {
    const html = render(
      field({
        inputType: "text",
        prepend: "https://",
        description: "Help text",
      }),
      "",
    );
    const input = tagOf(html, "meta-box-field-k-input");
    const id = attrOf(input, "id");
    expect(id).toBeTruthy();
    expect(attrOf(/<label[^>]*>/.exec(html)?.[0], "for")).toBe(id);
    expect(attrOf(input, "aria-describedby")?.split(" ")).toContain(
      attrOf(tagOf(html, "meta-box-field-k-description"), "id"),
    );
  });
});
