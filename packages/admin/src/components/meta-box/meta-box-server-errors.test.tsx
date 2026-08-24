import type { ReactNode } from "react";
import {
  applyMetaFieldErrors,
  extractMetaFieldErrors,
  useMetaFieldMessage,
} from "@/lib/meta-field-errors.js";
import { createQueryClient } from "@/providers/query-client.js";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { afterEach, describe, expect, test } from "vitest";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";
import { Form } from "@plumix/admin-ui/form";

import { renderWithI18n } from "../../../test/render-with-i18n.js";
import { MetaBoxField } from "./meta-box-field.js";

afterEach(cleanup);

describe("extractMetaFieldErrors", () => {
  test("pulls { path, message } rejections off a CONFLICT error", () => {
    const err = {
      code: "CONFLICT",
      data: {
        reason: "meta_invalid_value",
        key: "subtitle",
        errors: [
          {
            path: "subtitle",
            message: { id: "metaField.maxLength", values: { max: 5 } },
          },
          { path: "sections.0.heading", message: "Custom verdict" },
        ],
      },
    };
    expect(extractMetaFieldErrors(err)).toEqual(err.data.errors);
  });

  test("returns undefined for errors without a field list", () => {
    expect(extractMetaFieldErrors(new Error("boom"))).toBeUndefined();
    expect(
      extractMetaFieldErrors({ code: "CONFLICT", data: { reason: "x" } }),
    ).toBeUndefined();
    expect(
      extractMetaFieldErrors({ code: "CONFLICT", data: { errors: [] } }),
    ).toBeUndefined();
  });
});

// Mounts fields under an RHF form, applies server errors, and asserts
// the message lands inline on the addressed input — the admin half of
// the path-addressed write-rejection contract.
function Harness({
  fields,
  initial,
  serverErrors,
  // The settings card keeps its fields at the RHF root; every entity form
  // nests them under `meta`.
  basePath = "meta",
}: {
  fields: readonly MetaBoxFieldManifestEntry[];
  initial: Record<string, unknown>;
  serverErrors: readonly { path: string; message: unknown }[];
  basePath?: string;
}): ReactNode {
  const form = useForm<Record<string, unknown>>({
    defaultValues: basePath === "" ? initial : { meta: initial },
  });
  const resolveMessage = useMetaFieldMessage();
  const queryClient = createQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <Form {...form}>
        {fields.map((f) => (
          <MetaBoxField
            key={f.key}
            field={f}
            name={basePath === "" ? f.key : `${basePath}.${f.key}`}
          />
        ))}
        <button
          type="button"
          data-testid="apply-server-errors"
          onClick={() => {
            applyMetaFieldErrors(
              form.setError,
              basePath,
              extractMetaFieldErrors({
                code: "CONFLICT",
                data: { reason: "meta_invalid_value", errors: serverErrors },
              }) ?? [],
              resolveMessage,
            );
          }}
        >
          apply
        </button>
      </Form>
    </QueryClientProvider>
  );
}

describe("inline display of path-addressed write errors", () => {
  test("a scalar field shows its server message under the input", async () => {
    renderWithI18n(
      <Harness
        fields={[
          {
            key: "subtitle",
            label: "Subtitle",
            type: "string",
            inputType: "text",
          },
        ]}
        initial={{ subtitle: "way too long" }}
        serverErrors={[
          {
            path: "subtitle",
            message: {
              id: "metaField.maxLength",
              message: "Must be at most {max} characters.",
              values: { max: 5 },
            },
          },
        ]}
      />,
    );
    await userEvent.click(screen.getByTestId("apply-server-errors"));
    expect(
      screen.getByTestId("meta-box-field-subtitle-error").textContent,
    ).toBe("Must be at most 5 characters.");
  });

  test("a nested repeater cell error flags its row's summary", async () => {
    renderWithI18n(
      <Harness
        fields={[
          {
            key: "sections",
            label: "Sections",
            type: "json",
            inputType: "repeater",
            subFields: [
              {
                key: "heading",
                label: "Heading",
                type: "string",
                inputType: "text",
              },
            ],
          },
        ]}
        initial={{
          sections: [{ heading: "fine" }, { heading: "" }],
        }}
        serverErrors={[
          {
            path: "sections.1.heading",
            message: {
              id: "metaField.required",
              message: "This field is required.",
            },
          },
        ]}
      />,
    );
    await userEvent.click(screen.getByTestId("apply-server-errors"));
    // Row fields live in a dialog; the errored row's summary is flagged so the
    // author knows which to open. Only the addressed row (1) is flagged.
    expect(
      screen.getByTestId("meta-box-field-sections-input-row-1-error"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("meta-box-field-sections-input-row-0-error"),
    ).not.toBeInTheDocument();
    // The message itself renders once the row's dialog is opened.
    await userEvent.click(
      screen.getByTestId("meta-box-field-sections-input-row-1-edit"),
    );
    expect(
      (await screen.findByTestId("meta-box-field-heading-error")).textContent,
    ).toBe("This field is required.");
  });

  test("a repeater-root error does not wipe its cell errors", async () => {
    renderWithI18n(
      <Harness
        fields={[
          {
            key: "sections",
            label: "Sections",
            type: "json",
            inputType: "repeater",
            subFields: [
              {
                key: "heading",
                label: "Heading",
                type: "string",
                inputType: "text",
              },
            ],
          },
        ]}
        initial={{ sections: [{ heading: "" }] }}
        serverErrors={[
          // Cell error deliberately listed BEFORE the root error — RHF
          // setError on a parent path replaces the subtree, so the
          // apply order must put shallow paths first regardless.
          {
            path: "sections.0.heading",
            message: {
              id: "metaField.required",
              message: "This field is required.",
            },
          },
          {
            path: "sections",
            message: {
              id: "metaField.minRows",
              message: "Add at least {min} row(s).",
              values: { min: 2 },
            },
          },
        ]}
      />,
    );
    await userEvent.click(screen.getByTestId("apply-server-errors"));
    // The repeater-root error renders on the repeater's own message; the cell
    // error still flags row 0's summary (shallow-first apply didn't wipe it).
    expect(
      screen.getByTestId("meta-box-field-sections-error").textContent,
    ).toBe("Add at least 2 row(s).");
    expect(
      screen.getByTestId("meta-box-field-sections-input-row-0-error"),
    ).toBeInTheDocument();
  });

  test("a root base path addresses fields the settings card keeps unnested", async () => {
    renderWithI18n(
      <Harness
        basePath=""
        fields={[
          {
            key: "site_title",
            label: "Site title",
            type: "string",
            inputType: "text",
          },
        ]}
        initial={{ site_title: "way too long" }}
        serverErrors={[
          {
            path: "site_title",
            message: {
              id: "metaField.maxLength",
              message: "Must be at most {max} characters.",
              values: { max: 5 },
            },
          },
        ]}
      />,
    );
    await userEvent.click(screen.getByTestId("apply-server-errors"));
    expect(
      screen.getByTestId("meta-box-field-site_title-error").textContent,
    ).toBe("Must be at most 5 characters.");
  });

  test("plain-string messages (custom .validate() verdicts) pass through", async () => {
    renderWithI18n(
      <Harness
        fields={[
          { key: "slug", label: "Slug", type: "string", inputType: "text" },
        ]}
        initial={{ slug: "taken" }}
        serverErrors={[{ path: "slug", message: "Already in use" }]}
      />,
    );
    await userEvent.click(screen.getByTestId("apply-server-errors"));
    expect(screen.getByTestId("meta-box-field-slug-error").textContent).toBe(
      "Already in use",
    );
  });
});
