import { createQueryClient } from "@/providers/query-client.js";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { EntryMetaBoxManifestEntry } from "@plumix/core/manifest";

import type { PostEditorValues } from "./post-editor-form.js";
import { renderWithI18n } from "../../../test/render-with-i18n.js";
import { PlainFormLayout } from "./plain-form-layout.js";

afterEach(() => {
  cleanup();
});

const initialValues: PostEditorValues = {
  title: "Hello",
  slug: "hello",
  content: null,
  excerpt: "",
  status: "draft",
  meta: {},
  terms: {},
  parentId: null,
};

function wrap(children: React.ReactNode) {
  return (
    <QueryClientProvider client={createQueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe("PlainFormLayout", () => {
  test("renders revisionsTrigger in the header when provided", () => {
    renderWithI18n(
      wrap(
        <PlainFormLayout
          initialValues={initialValues}
          metaBoxes={[]}
          headline="Edit author"
          isSubmitting={false}
          serverError={null}
          onSubmit={() => undefined}
          revisionsTrigger={
            <button type="button" data-testid="custom-revisions-trigger">
              Revisions
            </button>
          }
        />,
      ),
    );
    expect(screen.getByTestId("custom-revisions-trigger")).toBeInTheDocument();
  });

  test("autosave debounces field edits and fires onSubmit", async () => {
    const onSubmit = vi.fn();
    renderWithI18n(
      wrap(
        <PlainFormLayout
          initialValues={initialValues}
          metaBoxes={[]}
          headline="Edit author"
          isSubmitting={false}
          serverError={null}
          onSubmit={onSubmit}
          autosaveMs={20}
        />,
      ),
    );
    const input = screen.getByTestId("plain-form-title-input");
    fireEvent.change(input, { target: { value: "Hello world" } });
    await waitFor(
      () => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      },
      { timeout: 1000 },
    );
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      title: "Hello world",
    });
  });

  describe("server field errors", () => {
    const metaBoxes: readonly EntryMetaBoxManifestEntry[] = [
      {
        id: "bio",
        label: "Biography",
        entryTypes: ["author"],
        fields: [
          {
            key: "headline",
            label: "Headline",
            type: "string",
            inputType: "text",
          },
        ],
      },
    ];

    test("pins a rejected meta value onto its input", () => {
      renderWithI18n(
        wrap(
          <PlainFormLayout
            initialValues={{ ...initialValues, meta: { headline: "x" } }}
            metaBoxes={metaBoxes}
            headline="Edit author"
            isSubmitting={false}
            serverError="Couldn't save."
            serverFieldErrors={[
              { path: "headline", message: "Headline is taken" },
            ]}
            onSubmit={() => undefined}
          />,
        ),
      );
      expect(
        screen.getByTestId("meta-box-field-headline-error").textContent,
      ).toBe("Headline is taken");
    });

    test("pins a nested repeater cell rejection onto that cell", async () => {
      renderWithI18n(
        wrap(
          <PlainFormLayout
            initialValues={{
              ...initialValues,
              meta: { sections: [{ heading: "fine" }, { heading: "" }] },
            }}
            metaBoxes={[
              {
                id: "layout",
                label: "Layout",
                entryTypes: ["author"],
                fields: [
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
                ],
              },
            ]}
            headline="Edit author"
            isSubmitting={false}
            serverError="Couldn't save."
            serverFieldErrors={[
              { path: "sections.1.heading", message: "Heading is required" },
            ]}
            onSubmit={() => undefined}
          />,
        ),
      );
      expect(
        screen.queryByTestId("meta-box-field-sections-input-row-0-error"),
      ).not.toBeInTheDocument();
      await userEvent.click(
        screen.getByTestId("meta-box-field-sections-input-row-1-edit"),
      );
      expect(
        (await screen.findByTestId("meta-box-field-heading-error")).textContent,
      ).toBe("Heading is required");
    });

    test("a later successful save removes the pinned error", () => {
      const props = {
        initialValues: { ...initialValues, meta: { headline: "x" } },
        metaBoxes,
        headline: "Edit author",
        isSubmitting: false,
        onSubmit: () => undefined,
      };
      const { rerender } = renderWithI18n(
        wrap(
          <PlainFormLayout
            {...props}
            serverError="Couldn't save."
            serverFieldErrors={[
              { path: "headline", message: "Headline is taken" },
            ]}
          />,
        ),
      );
      expect(
        screen.getByTestId("meta-box-field-headline-error").textContent,
      ).toBe("Headline is taken");
      rerender(
        wrap(
          <PlainFormLayout
            {...props}
            serverError={null}
            serverFieldErrors={null}
          />,
        ),
      );
      expect(
        screen.queryByTestId("meta-box-field-headline-error"),
      ).not.toBeInTheDocument();
    });
  });
});
