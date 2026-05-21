import { createQueryClient } from "@/providers/query-client.js";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { PostEditorValues } from "./post-editor-form.js";
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
    render(
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
    render(
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
});
