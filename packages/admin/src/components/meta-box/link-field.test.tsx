import type { ReactNode } from "react";
import { createQueryClient } from "@/providers/query-client.js";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, useWatch } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";
import { Form } from "@plumix/admin-ui/form";

import type { RpcStub } from "../../../test/rpc.js";
import type { LookupItem } from "./lookup/types.js";
import { clearManifest, seedManifest } from "../../../test/manifest.js";
import { renderWithI18n } from "../../../test/render-with-i18n.js";
import { stubRpc } from "../../../test/rpc.js";
import { MetaBoxField } from "./meta-box-field.js";

// The picker offers the manifest's public entry types and searches them
// through the lookup RPC, so both come from their real sources: a manifest
// payload in the document and the oRPC client answered at the fetch boundary.
function seedEntryTypes(...names: readonly string[]): void {
  seedManifest({
    entryTypes: names.map((name) => ({
      name,
      adminSlug: `${name}s`,
      label: name,
      isPublic: true,
    })),
  });
}

function stubLookup(items: readonly LookupItem[] = []): RpcStub {
  return stubRpc({ "lookup/list": () => ({ items }) });
}

beforeEach(() => {
  seedEntryTypes("post", "page");
  stubLookup();
});

afterEach(() => {
  cleanup();
  clearManifest();
  vi.unstubAllGlobals();
});

const linkField: MetaBoxFieldManifestEntry = {
  key: "cta",
  label: "Call to action",
  type: "json",
  inputType: "link",
};

function Harness({
  initial,
  onChangeSpy,
}: {
  initial: unknown;
  onChangeSpy?: (next: unknown) => void;
}): ReactNode {
  const form = useForm<Record<string, unknown>>({
    defaultValues: { cta: initial },
  });
  const queryClient = createQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <Form {...form}>
        <MetaBoxField field={linkField} name="cta" />
        {onChangeSpy ? <Spy onChange={onChangeSpy} /> : null}
      </Form>
    </QueryClientProvider>
  );
}

function Spy({ onChange }: { onChange: (next: unknown) => void }): ReactNode {
  const value: unknown = useWatch({ name: "cta" });
  onChange(value);
  return null;
}

describe("LinkField", () => {
  test("prefills url, label, and new-tab from the stored value", () => {
    renderWithI18n(
      <Harness
        initial={{ url: "https://example.com", label: "Go", newTab: true }}
      />,
    );
    expect(screen.getByTestId("meta-box-field-cta-input-url")).toHaveValue(
      "https://example.com",
    );
    expect(screen.getByTestId("meta-box-field-cta-input-label")).toHaveValue(
      "Go",
    );
    expect(
      screen.getByTestId("meta-box-field-cta-input-newtab"),
    ).toHaveAttribute("data-state", "checked");
  });

  test("new-tab switch and label input merge into the emitted value", async () => {
    const onChange = vi.fn();
    renderWithI18n(
      <Harness initial={{ url: "/pricing" }} onChangeSpy={onChange} />,
    );

    await userEvent.click(
      screen.getByTestId("meta-box-field-cta-input-newtab"),
    );
    expect(onChange).toHaveBeenLastCalledWith({
      url: "/pricing",
      newTab: true,
    });

    await userEvent.type(
      screen.getByTestId("meta-box-field-cta-input-label"),
      "G",
    );
    expect(onChange).toHaveBeenLastCalledWith({
      url: "/pricing",
      label: "G",
      newTab: true,
    });
  });

  test("picking an entry stores its permalink as the url", async () => {
    const rpc = stubLookup([
      {
        id: "1",
        label: "Pricing",
        targetType: "page",
        subtitle: "page · published",
        href: "/pricing",
      },
      // No public URL — must not be offered.
      { id: "2", label: "Internal", targetType: "page" },
    ]);
    const onChange = vi.fn();
    renderWithI18n(<Harness initial={null} onChangeSpy={onChange} />);

    await userEvent.click(screen.getByTestId("meta-box-field-cta-input-pick"));
    await waitFor(() => {
      expect(
        screen.getByTestId("meta-box-field-cta-input-option-1"),
      ).toBeVisible();
    });
    expect(rpc.lastCallTo("lookup/list")?.input).toMatchObject({
      kind: "entry",
      scope: { entryTypes: ["post", "page"], status: "published" },
    });
    expect(
      screen.queryByTestId("meta-box-field-cta-input-option-2"),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByTestId("meta-box-field-cta-input-option-1"),
    );
    expect(onChange).toHaveBeenLastCalledWith({ url: "/pricing" });
    expect(screen.getByTestId("meta-box-field-cta-input-url")).toHaveValue(
      "/pricing",
    );
  });

  test("a URL-less draft emits null but keeps the typed text in the UI", async () => {
    const onChange = vi.fn();
    renderWithI18n(<Harness initial={null} onChangeSpy={onChange} />);

    const label = screen.getByTestId("meta-box-field-cta-input-label");
    await userEvent.type(label, "Go");
    // Half-filled: nothing valid to store yet — the form must hold
    // null (saving deletes the key) rather than `{ url: "" }` (which
    // the server rejects and would block the whole entry save).
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(label).toHaveValue("Go");

    await userEvent.type(
      screen.getByTestId("meta-box-field-cta-input-url"),
      "/x",
    );
    expect(onChange).toHaveBeenLastCalledWith({ url: "/x", label: "Go" });
  });

  test("no public entry types hides the Pick button", () => {
    seedManifest({ entryTypes: [] });
    renderWithI18n(<Harness initial={null} />);
    expect(screen.getByTestId("meta-box-field-cta-input-url")).toBeVisible();
    expect(
      screen.queryByTestId("meta-box-field-cta-input-pick"),
    ).not.toBeInTheDocument();
  });
});
