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
}: {
  fields: readonly MetaBoxFieldManifestEntry[];
  initial: Record<string, unknown>;
  serverErrors: readonly { path: string; message: unknown }[];
}): ReactNode {
  const form = useForm<Record<string, unknown>>({
    defaultValues: { meta: initial },
  });
  const resolveMessage = useMetaFieldMessage();
  const queryClient = createQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <Form {...form}>
        {fields.map((f) => (
          <MetaBoxField key={f.key} field={f} name={`meta.${f.key}`} />
        ))}
        <button
          type="button"
          data-testid="apply-server-errors"
          onClick={() => {
            applyMetaFieldErrors(
              form.setError,
              "meta",
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

  test("a nested repeater cell shows the error on the addressed row input", async () => {
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
          } as MetaBoxFieldManifestEntry,
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
    const errors = screen.getAllByTestId("meta-box-field-heading-error");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.textContent).toBe("This field is required.");
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
          } as MetaBoxFieldManifestEntry,
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
    expect(screen.getByTestId("meta-box-field-heading-error").textContent).toBe(
      "This field is required.",
    );
    expect(
      screen.getByTestId("meta-box-field-sections-error").textContent,
    ).toBe("Add at least 2 row(s).");
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
