import type { MessageDescriptor } from "@lingui/core";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import { MetaBoxField } from "@/components/meta-box/meta-box-field.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { useForm, useWatch } from "react-hook-form";

import type { EntryMetaBoxManifestEntry } from "@plumix/core/manifest";
import { Form } from "@plumix/admin-ui/form";
import { Input } from "@plumix/admin-ui/input";
import { Label } from "@plumix/admin-ui/label";

const M = {
  title: defineMessage({ id: "editor.document.title", message: "Title" }),
  slug: defineMessage({ id: "editor.document.slug", message: "Slug" }),
  excerpt: defineMessage({ id: "editor.document.excerpt", message: "Excerpt" }),
  parent: defineMessage({ id: "editor.document.parent", message: "Parent" }),
  noParent: defineMessage({
    id: "editor.document.parent.none",
    message: "(no parent)",
  }),
} satisfies Record<string, MessageDescriptor>;

interface DocumentParentOption {
  readonly id: number;
  readonly title: string;
}

interface DocumentSettingsPanelProps {
  /** Present only when the entry type's supports list includes "title". */
  readonly title?: {
    readonly value: string;
    readonly onChange: (next: string) => void;
  };
  readonly slug: string;
  readonly onSlugChange: (next: string) => void;
  /** Present only when the entry type's supports list includes "excerpt". */
  readonly excerpt?: {
    readonly value: string;
    readonly onChange: (next: string) => void;
  };
  /** Present only for hierarchical entry types. */
  readonly parent?: {
    readonly value: number | null;
    readonly options: readonly DocumentParentOption[];
    readonly onChange: (next: number | null) => void;
  };
  /** Capability-filtered metaboxes for this entry type, if any. */
  readonly metaBoxes?: {
    readonly boxes: readonly EntryMetaBoxManifestEntry[];
    readonly initialMeta: Record<string, unknown>;
    readonly onMetaChange: (next: Record<string, unknown>) => void;
  };
}

// MetaBoxField expects an ancestor react-hook-form <Form> provider —
// this wrapper owns that form and forwards every change into the
// route's autosave path.
function DocumentMetaBoxes({
  boxes,
  initialMeta,
  onMetaChange,
}: {
  readonly boxes: readonly EntryMetaBoxManifestEntry[];
  readonly initialMeta: Record<string, unknown>;
  readonly onMetaChange: (next: Record<string, unknown>) => void;
}): ReactElement {
  const renderLabel = useLabel();
  const form = useForm<{ meta: Record<string, unknown> }>({
    defaultValues: { meta: initialMeta },
  });
  const watchedMeta = useWatch({ control: form.control, name: "meta" });
  const onMetaChangeRef = useRef(onMetaChange);
  useEffect(() => {
    onMetaChangeRef.current = onMetaChange;
  });
  useEffect(() => {
    onMetaChangeRef.current(watchedMeta);
  }, [watchedMeta]);
  return (
    <Form {...form}>
      {boxes.map((box) => (
        <section
          key={box.id}
          className="flex flex-col gap-3"
          data-testid={`entry-meta-box-${box.id}`}
        >
          <h3 className="text-sm font-medium">{renderLabel(box.label)}</h3>
          {box.fields.map((field) => (
            <MetaBoxField
              key={field.key}
              field={field}
              name={`meta.${field.key}`}
            />
          ))}
        </section>
      ))}
    </Form>
  );
}

/**
 * Document-level entry fields for the editor's right sidebar — the
 * WP "document settings" counterpart. Dumb by design: the route owns
 * persistence (structural fields write the live row; the autosave-row
 * patch drops them) and feeds values + change handlers in.
 */
export function DocumentSettingsPanel({
  title,
  slug,
  onSlugChange,
  excerpt,
  parent,
  metaBoxes,
}: DocumentSettingsPanelProps): ReactElement {
  const renderLabel = useLabel();
  return (
    <div
      className="flex flex-col gap-4 px-4 py-4"
      data-testid="entry-document-panel"
    >
      {title ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entry-title-input">{renderLabel(M.title)}</Label>
          <Input
            id="entry-title-input"
            type="text"
            value={title.value}
            onChange={(event) => {
              title.onChange(event.target.value);
            }}
            data-testid="plumix-editor-title-input"
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="entry-slug-input">{renderLabel(M.slug)}</Label>
        <Input
          id="entry-slug-input"
          type="text"
          value={slug}
          onChange={(event) => {
            onSlugChange(event.target.value);
          }}
          data-testid="entry-slug-input"
        />
      </div>
      {parent ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entry-parent-select">{renderLabel(M.parent)}</Label>
          <select
            id="entry-parent-select"
            value={parent.value === null ? "" : String(parent.value)}
            onChange={(event) => {
              const raw = event.target.value;
              parent.onChange(raw === "" ? null : Number(raw));
            }}
            className="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
            data-testid="entry-parent-select"
          >
            <option value="">{renderLabel(M.noParent)}</option>
            {parent.options.map((option) => (
              <option key={option.id} value={String(option.id)}>
                {option.title}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {excerpt ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entry-excerpt-input">{renderLabel(M.excerpt)}</Label>
          <textarea
            id="entry-excerpt-input"
            rows={3}
            value={excerpt.value}
            onChange={(event) => {
              excerpt.onChange(event.target.value);
            }}
            className="border-input bg-background focus-visible:ring-ring flex min-h-20 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            data-testid="entry-excerpt-input"
          />
        </div>
      ) : null}
      {metaBoxes && metaBoxes.boxes.length > 0 ? (
        <DocumentMetaBoxes
          boxes={metaBoxes.boxes}
          initialMeta={metaBoxes.initialMeta}
          onMetaChange={metaBoxes.onMetaChange}
        />
      ) : null}
    </div>
  );
}
