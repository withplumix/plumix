import type { MultiSelectOption } from "@/components/form/multi-select.js";
import type { MessageDescriptor } from "@lingui/core";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import { MultiSelect } from "@/components/form/multi-select.js";
import { MetaBoxField } from "@/components/meta-box/meta-box-field.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { useForm, useWatch } from "react-hook-form";

import type {
  EntryMetaBoxManifestEntry,
  NamedTemplateChoice,
} from "@plumix/core/manifest";
import { Field, FieldLabel } from "@plumix/admin-ui/field";
import { Form } from "@plumix/admin-ui/form";
import { Input } from "@plumix/admin-ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plumix/admin-ui/select";
import { Textarea } from "@plumix/admin-ui/textarea";

const M = {
  title: defineMessage({ id: "editor.document.title", message: "Title" }),
  slug: defineMessage({ id: "editor.document.slug", message: "Slug" }),
  excerpt: defineMessage({ id: "editor.document.excerpt", message: "Excerpt" }),
  parent: defineMessage({ id: "editor.document.parent", message: "Parent" }),
  noParent: defineMessage({
    id: "editor.document.parent.none",
    message: "(no parent)",
  }),
  template: defineMessage({
    id: "editor.document.template",
    message: "Template",
  }),
  themeDefault: defineMessage({
    id: "editor.document.template.default",
    message: "(theme default)",
  }),
} satisfies Record<string, MessageDescriptor>;

// Radix Select forbids an empty-string item value, so the "no parent"
// choice carries a sentinel that maps back to `null` on change.
const NO_PARENT_VALUE = "__none__";

// Same Radix constraint for the "theme default" (no override) template choice.
const THEME_DEFAULT_VALUE = "__default__";

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
  /** Present only when the theme registers `named` templates for this type. */
  readonly template?: {
    readonly value: string | null;
    readonly options: readonly NamedTemplateChoice[];
    readonly onChange: (next: string | null) => void;
  };
  /** Term pickers for the taxonomies registered against this entry type. */
  readonly taxonomies?: readonly {
    readonly name: string;
    readonly label: string;
    readonly options: readonly MultiSelectOption[];
    readonly value: readonly string[];
    readonly onChange: (next: readonly string[]) => void;
  }[];
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
  template,
  taxonomies,
  metaBoxes,
}: DocumentSettingsPanelProps): ReactElement {
  const renderLabel = useLabel();
  return (
    <div
      className="flex flex-col gap-4 px-4 py-4"
      data-testid="entry-document-panel"
    >
      {title ? (
        <Field className="gap-1.5">
          <FieldLabel htmlFor="entry-title-input">
            {renderLabel(M.title)}
          </FieldLabel>
          <Input
            id="entry-title-input"
            type="text"
            value={title.value}
            onChange={(event) => {
              title.onChange(event.target.value);
            }}
            data-testid="plumix-editor-title-input"
          />
        </Field>
      ) : null}
      <Field className="gap-1.5">
        <FieldLabel htmlFor="entry-slug-input">
          {renderLabel(M.slug)}
        </FieldLabel>
        <Input
          id="entry-slug-input"
          type="text"
          value={slug}
          onChange={(event) => {
            onSlugChange(event.target.value);
          }}
          data-testid="entry-slug-input"
        />
      </Field>
      {parent ? (
        <Field className="gap-1.5">
          <FieldLabel htmlFor="entry-parent-select">
            {renderLabel(M.parent)}
          </FieldLabel>
          <Select
            value={
              parent.value === null ? NO_PARENT_VALUE : String(parent.value)
            }
            onValueChange={(next) => {
              parent.onChange(next === NO_PARENT_VALUE ? null : Number(next));
            }}
          >
            <SelectTrigger
              id="entry-parent-select"
              className="w-full"
              data-testid="entry-parent-select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PARENT_VALUE}>
                {renderLabel(M.noParent)}
              </SelectItem>
              {parent.options.map((option) => (
                <SelectItem
                  key={option.id}
                  value={String(option.id)}
                  data-testid={`entry-parent-select-option-${option.id}`}
                >
                  {option.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {template && template.options.length > 0 ? (
        <Field className="gap-1.5">
          <FieldLabel htmlFor="entry-template-select">
            {renderLabel(M.template)}
          </FieldLabel>
          <Select
            value={template.value ?? THEME_DEFAULT_VALUE}
            onValueChange={(next) => {
              template.onChange(next === THEME_DEFAULT_VALUE ? null : next);
            }}
          >
            <SelectTrigger
              id="entry-template-select"
              className="w-full"
              data-testid="entry-template-select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                value={THEME_DEFAULT_VALUE}
                data-testid="entry-template-select-option-default"
              >
                {renderLabel(M.themeDefault)}
              </SelectItem>
              {template.options.map((option) => (
                <SelectItem
                  key={option.id}
                  value={option.id}
                  data-testid={`entry-template-select-option-${option.id}`}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {taxonomies?.map((taxonomy) => (
        <Field key={taxonomy.name} className="gap-1.5">
          <FieldLabel htmlFor={`entry-taxonomy-${taxonomy.name}`}>
            {taxonomy.label}
          </FieldLabel>
          <MultiSelect
            id={`entry-taxonomy-${taxonomy.name}`}
            options={taxonomy.options}
            value={taxonomy.value}
            onChange={taxonomy.onChange}
            testId={`entry-taxonomy-${taxonomy.name}`}
          />
        </Field>
      ))}
      {excerpt ? (
        <Field className="gap-1.5">
          <FieldLabel htmlFor="entry-excerpt-input">
            {renderLabel(M.excerpt)}
          </FieldLabel>
          <Textarea
            id="entry-excerpt-input"
            rows={3}
            value={excerpt.value}
            onChange={(event) => {
              excerpt.onChange(event.target.value);
            }}
            className="min-h-20"
            data-testid="entry-excerpt-input"
          />
        </Field>
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
