import type { ReactNode } from "react";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, test } from "vitest";

import type { TermMetaBoxManifestEntry } from "@plumix/core/manifest";
import { Form } from "@plumix/admin-ui/form";

import { renderWithI18n } from "../../../test/render-with-i18n.js";
import { MetaBoxCard } from "./meta-box.js";
import { useVisibleFields } from "./use-visible-fields.js";

afterEach(cleanup);

// A driver text field and a dependent whose visibility rides on it —
// the wire shape a `.visibleWhen(layout.is("video"))` chain compiles to.
const conditionalBox = {
  id: "video",
  label: "Video",
  termTaxonomies: ["category"],
  fields: [
    { key: "layout", label: "Layout", type: "string", inputType: "text" },
    {
      key: "videoUrl",
      label: "Video URL",
      type: "string",
      inputType: "url",
      visibleWhen: [[{ key: "layout", op: "eq", value: "video" }]],
    },
  ],
} satisfies TermMetaBoxManifestEntry;

function Harness({
  initialMeta,
}: {
  initialMeta: Record<string, unknown>;
}): ReactNode {
  const form = useForm<{ meta: Record<string, unknown> }>({
    defaultValues: { meta: initialMeta },
  });
  return (
    <Form {...form}>
      <MetaBoxCard box={conditionalBox} basePath="meta" />
    </Form>
  );
}

// The settings card renders fields at the form root and owns its form
// instance — the hook's no-name + explicit-control path.
function RootHarness({
  initial,
}: {
  initial: Record<string, unknown>;
}): ReactNode {
  const form = useForm<Record<string, unknown>>({ defaultValues: initial });
  const visible = useVisibleFields(conditionalBox.fields, {
    control: form.control,
  });
  return (
    <ul>
      {visible.map((field) => (
        <li key={field.key} data-testid={`visible-${field.key}`} />
      ))}
    </ul>
  );
}

describe("useVisibleFields at the form root (settings card path)", () => {
  test("filters against root-level values via explicit control", () => {
    renderWithI18n(<RootHarness initial={{ layout: "standard" }} />);
    expect(screen.getByTestId("visible-layout")).toBeDefined();
    expect(screen.queryByTestId("visible-videoUrl")).toBeNull();
    cleanup();
    renderWithI18n(<RootHarness initial={{ layout: "video" }} />);
    expect(screen.getByTestId("visible-videoUrl")).toBeDefined();
  });
});

describe("MetaBoxCard conditional visibility", () => {
  test("a condition-hidden field does not render", () => {
    renderWithI18n(<Harness initialMeta={{ layout: "standard" }} />);
    expect(screen.getByTestId("meta-box-field-layout")).toBeDefined();
    expect(screen.queryByTestId("meta-box-field-videoUrl")).toBeNull();
  });

  test("a field whose condition passes renders", () => {
    renderWithI18n(<Harness initialMeta={{ layout: "video" }} />);
    expect(screen.getByTestId("meta-box-field-videoUrl")).toBeDefined();
  });

  test("fields show and hide live as the driver value changes", async () => {
    const user = userEvent.setup();
    renderWithI18n(<Harness initialMeta={{ layout: "standard" }} />);
    expect(screen.queryByTestId("meta-box-field-videoUrl")).toBeNull();

    const driver = screen.getByTestId("meta-box-field-layout-input");
    await user.clear(driver);
    await user.type(driver, "video");
    expect(screen.getByTestId("meta-box-field-videoUrl")).toBeDefined();

    await user.clear(driver);
    await user.type(driver, "standard");
    expect(screen.queryByTestId("meta-box-field-videoUrl")).toBeNull();
  });
});
