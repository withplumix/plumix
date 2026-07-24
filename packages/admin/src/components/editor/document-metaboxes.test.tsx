import { createQueryClient } from "@/providers/query-client.js";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { EntryMetaBoxManifestEntry } from "@plumix/core/manifest";

import { renderWithI18n } from "../../../test/render-with-i18n.js";
import { diffMetaBag } from "../../editor/meta-diff.js";
import { DocumentMetaBoxes } from "./document-settings.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const box: EntryMetaBoxManifestEntry = {
  id: "showcase",
  label: "Showcase",
  entryTypes: ["post"],
  fields: [
    { key: "subtitle", label: "Subtitle", type: "string", inputType: "text" },
  ],
};

describe("DocumentMetaBoxes foreign-key retention", () => {
  // The autosave diff only sends changed keys; that hinges on the metabox form
  // carrying untouched foreign keys (e.g. `featuredImage`, written by another
  // plugin and never rendered here) through every emitted value. If that ever
  // regressed, the diff would emit `{ featuredImage: null }` and the server
  // would reject the whole write — re-breaking the original bug. Pin it.
  test("editing a registered field leaves a foreign key untouched, so the diff omits it", async () => {
    const initialMeta = {
      subtitle: "old",
      featuredImage: {
        src: "/hero.jpg",
        alt: "Hero",
        width: 1200,
        height: 800,
      },
    };
    const onMetaChange = vi.fn<(next: Record<string, unknown>) => void>();

    const queryClient = createQueryClient();
    renderWithI18n(
      <QueryClientProvider client={queryClient}>
        <DocumentMetaBoxes
          boxes={[box]}
          initialMeta={initialMeta}
          onMetaChange={onMetaChange}
        />
      </QueryClientProvider>,
    );

    const input = screen.getByTestId("meta-box-field-subtitle-input");
    await userEvent.type(input, "!");

    const emitted = onMetaChange.mock.calls.at(-1)?.[0];
    // The emitted bag still carries the untouched foreign key verbatim…
    expect(emitted?.featuredImage).toEqual(initialMeta.featuredImage);
    expect(emitted?.subtitle).toBe("old!");

    // …so the diff sent to the server is only the changed key — the foreign
    // key is neither re-sent nor nulled.
    const patch = diffMetaBag(initialMeta, emitted ?? {});
    expect(patch).toEqual({ subtitle: "old!" });
    expect("featuredImage" in patch).toBe(false);
  });
});
