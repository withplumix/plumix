import { createQueryClient } from "@/providers/query-client.js";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { EntryMetaBoxManifestEntry } from "@plumix/core/manifest";

import { renderWithI18n } from "../../../test/render-with-i18n.js";
import { diffMetaBag } from "../../editor/meta-diff.js";
import {
  _resetPluginRegistry,
  registerPluginFieldType,
} from "../../lib/plugin-registry.js";
import { DocumentMetaBoxes } from "./document-settings.js";

afterEach(() => {
  cleanup();
  _resetPluginRegistry();
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
  // If the form dropped foreign keys, the diff would emit
  // `{ featuredImage: null }` and the server would reject the whole write.
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

  test("mounting with the stored meta emits it unchanged, so the diff is empty", () => {
    const seeded = { subtitle: "old", accent: "#3366ff" };
    const onMetaChange = vi.fn<(next: Record<string, unknown>) => void>();

    const queryClient = createQueryClient();
    renderWithI18n(
      <QueryClientProvider client={queryClient}>
        <DocumentMetaBoxes
          boxes={[box]}
          initialMeta={seeded}
          onMetaChange={onMetaChange}
        />
      </QueryClientProvider>,
    );

    const emittedOnMount = onMetaChange.mock.calls.at(-1)?.[0];
    expect(diffMetaBag(seeded, emittedOnMount ?? {})).toEqual({});
  });
});

// A display-only renderer still occupies a meta key it never writes, which
// must not read as a change on open.
describe("DocumentMetaBoxes display-only fields", () => {
  test("a renderer that never writes leaves the diff empty", () => {
    registerPluginFieldType("previewOnly", () => <p>nothing to write</p>);
    const displayBox: EntryMetaBoxManifestEntry = {
      id: "preview",
      label: "Preview",
      entryTypes: ["post"],
      fields: [
        {
          key: "card_preview",
          label: "Card",
          type: "json",
          inputType: "previewOnly",
        },
      ],
    };
    const seeded = { subtitle: "old" };
    const onMetaChange = vi.fn<(next: Record<string, unknown>) => void>();

    const queryClient = createQueryClient();
    renderWithI18n(
      <QueryClientProvider client={queryClient}>
        <DocumentMetaBoxes
          boxes={[box, displayBox]}
          initialMeta={seeded}
          onMetaChange={onMetaChange}
        />
      </QueryClientProvider>,
    );

    const emitted = onMetaChange.mock.calls.at(-1)?.[0];
    expect(diffMetaBag(seeded, emitted ?? {})).toEqual({});
  });
});
