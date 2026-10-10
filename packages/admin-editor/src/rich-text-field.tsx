import type { Editor, JSONContent } from "@tiptap/react";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Trans } from "@lingui/react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";

import { Button } from "@plumix/admin-ui/button";
import {
  Bold,
  Code2,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Subscript,
  Superscript,
  Trash2,
  Underline,
} from "@plumix/admin-ui/icons";
import { Input } from "@plumix/admin-ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@plumix/admin-ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plumix/admin-ui/select";
import { Toggle } from "@plumix/admin-ui/toggle";
import { HEADING_LEVELS } from "@plumix/core/blocks";

import type { RichTextExtensionOptions } from "./rich-text-extensions.js";
import {
  allowsMark,
  allowsNode,
  richTextExtensions,
} from "./rich-text-extensions.js";

// Re-exported so JSON-mode consumers (the metabox `richtext()` field) can
// name the value type without taking a direct Tiptap dependency.
export type { JSONContent } from "@tiptap/react";

interface RichTextFieldCommonProps {
  readonly testId: string;
  readonly disabled?: boolean;
  /** Metabox fields have no host label. */
  readonly ariaLabel?: string;
  /** Omitted admits the full set. */
  readonly allow?: RichTextExtensionOptions;
}

interface HtmlRichTextFieldProps extends RichTextFieldCommonProps {
  readonly serialization?: "html";
  readonly value: string;
  readonly onChange: (html: string) => void;
}

interface JsonRichTextFieldProps extends RichTextFieldCommonProps {
  readonly serialization: "json";
  readonly value: JSONContent | null;
  readonly onChange: (doc: JSONContent) => void;
}

type RichTextFieldProps = HtmlRichTextFieldProps | JsonRichTextFieldProps;

const MARKS = [
  { name: "bold", icon: Bold, testId: "bold", label: "Bold" },
  { name: "italic", icon: Italic, testId: "italic", label: "Italic" },
  {
    name: "underline",
    icon: Underline,
    testId: "underline",
    label: "Underline",
  },
  {
    name: "strike",
    icon: Strikethrough,
    testId: "strike",
    label: "Strikethrough",
  },
  { name: "code", icon: Code2, testId: "code", label: "Inline code" },
  {
    name: "highlight",
    icon: Highlighter,
    testId: "highlight",
    label: "Highlight",
  },
  {
    name: "subscript",
    icon: Subscript,
    testId: "subscript",
    label: "Subscript",
  },
  {
    name: "superscript",
    icon: Superscript,
    testId: "superscript",
    label: "Superscript",
  },
] as const;

// The active-mark/-node flags the toolbar paints its pressed state from.
// Derived via useEditorState so the toolbar re-renders on selection changes
// without re-rendering on every keystroke.
interface ActiveState {
  readonly marks: Readonly<Record<string, boolean>>;
  readonly link: boolean;
  readonly bulletList: boolean;
  readonly orderedList: boolean;
  readonly blockquote: boolean;
  /** Null when the block is a paragraph. */
  readonly headingLevel: number | null;
}

// The trailing-node extension's empty paragraph is the editor's, not the
// author's. The sync guard compares this same form, or every keystroke resets
// the editor.
function storedHtml(editor: Editor): string {
  const html = editor.getHTML();
  return html !== EMPTY_PARAGRAPH && html.endsWith(EMPTY_PARAGRAPH)
    ? html.slice(0, -EMPTY_PARAGRAPH.length)
    : html;
}

function storedJson(editor: Editor): JSONContent {
  const doc = editor.getJSON();
  const nodes = doc.content;
  const last = nodes.at(-1);
  return nodes.length > 1 && last?.type === "paragraph" && !last.content
    ? { ...doc, content: nodes.slice(0, -1) }
    : doc;
}

const EMPTY_PARAGRAPH = "<p></p>";

export function RichTextField(props: RichTextFieldProps): ReactElement {
  const { testId, allow, ariaLabel } = props;
  const disabled = props.disabled ?? false;

  // Serialize + dispatch through a ref so the once-created editor's onUpdate
  // always sees the latest props without re-creating the editor (which would
  // drop focus). The serialization discriminates which getter/onChange runs.
  const emitRef = useRef<(editor: Editor) => void>(() => undefined);
  useEffect(() => {
    emitRef.current = (editor: Editor): void => {
      if (props.serialization === "json") props.onChange(storedJson(editor));
      else props.onChange(storedHtml(editor));
    };
  });

  const editor = useEditor({
    extensions: richTextExtensions(allow),
    content: props.value,
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_:focus]:outline-none",
        "data-testid": `${testId}-editor`,
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      },
    },
    onUpdate: ({ editor }) => emitRef.current(editor),
  });

  // Relies on the host storing back the exact value emitted; any
  // re-serialization between onChange and `value` would reset the caret
  // mid-type.
  useEffect(() => {
    if (!editor) return;
    if (props.serialization === "json") {
      const next = props.value;
      if (next == null) {
        if (!editor.isEmpty)
          editor.commands.setContent(null, { emitUpdate: false });
      } else if (JSON.stringify(next) !== JSON.stringify(storedJson(editor))) {
        editor.commands.setContent(next, { emitUpdate: false });
      }
    } else if (props.value !== storedHtml(editor)) {
      editor.commands.setContent(props.value, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- serialization is stable per instance; value drives the sync
  }, [editor, props.value]);

  // Toggling `disabled` flips the live editor's editability in place.
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const active = useEditorState({
    editor,
    selector: ({ editor }): ActiveState | null =>
      editor
        ? {
            marks: Object.fromEntries(
              MARKS.map(({ name }) => [name, editor.isActive(name)]),
            ),
            link: editor.isActive("link"),
            bulletList: editor.isActive("bulletList"),
            orderedList: editor.isActive("orderedList"),
            blockquote: editor.isActive("blockquote"),
            headingLevel:
              HEADING_LEVELS.find((level) =>
                editor.isActive("heading", { level }),
              ) ?? null,
          }
        : null,
  });

  // A button for content the schema can't hold would produce what the server
  // rejects.
  const controlDisabled = !editor || disabled;
  const visibleMarks = MARKS.filter(({ name }) => allowsMark(allow, name));
  const showHeadings = allowsNode(allow, "heading");
  const showBulletList = allowsNode(allow, "bulletList");
  const showOrderedList = allowsNode(allow, "orderedList");
  const showBlockquote = allowsNode(allow, "blockquote");
  const showLink = allowsMark(allow, "link");

  return (
    <div className="flex flex-col gap-1.5" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-0.5" role="toolbar">
        {showHeadings ? (
          <Select
            disabled={controlDisabled}
            value={
              active?.headingLevel ? `h${active.headingLevel}` : "paragraph"
            }
            onValueChange={(next) => setFormat(editor, next)}
          >
            <SelectTrigger
              size="sm"
              className="me-1"
              aria-label="Text format"
              data-testid={`${testId}-format`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                value="paragraph"
                data-testid={`${testId}-format-paragraph`}
              >
                Paragraph
              </SelectItem>
              {HEADING_LEVELS.map((level) => (
                <SelectItem
                  key={level}
                  value={`h${level}`}
                  data-testid={`${testId}-format-h${level}`}
                >
                  Heading {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {visibleMarks.map(({ name, icon: Icon, testId: suffix, label }) => (
          <ToolbarToggle
            key={name}
            testId={`${testId}-${suffix}`}
            label={label}
            pressed={active?.marks[name] ?? false}
            disabled={controlDisabled}
            onToggle={() => editor?.chain().focus().toggleMark(name).run()}
          >
            <Icon />
          </ToolbarToggle>
        ))}
        {showBulletList ? (
          <ToolbarToggle
            testId={`${testId}-bullet-list`}
            label="Bullet list"
            pressed={active?.bulletList ?? false}
            disabled={controlDisabled}
            onToggle={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List />
          </ToolbarToggle>
        ) : null}
        {showOrderedList ? (
          <ToolbarToggle
            testId={`${testId}-ordered-list`}
            label="Numbered list"
            pressed={active?.orderedList ?? false}
            disabled={controlDisabled}
            onToggle={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered />
          </ToolbarToggle>
        ) : null}
        {showBlockquote ? (
          <ToolbarToggle
            testId={`${testId}-blockquote`}
            label="Blockquote"
            pressed={active?.blockquote ?? false}
            disabled={controlDisabled}
            onToggle={() => editor?.chain().focus().toggleBlockquote().run()}
          >
            <Quote />
          </ToolbarToggle>
        ) : null}
        {showLink ? (
          <LinkPopover
            editor={editor}
            active={active?.link ?? false}
            disabled={controlDisabled}
            testId={testId}
          />
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          data-testid={`${testId}-clear`}
          disabled={controlDisabled}
          onClick={() =>
            editor?.chain().focus().unsetAllMarks().clearNodes().run()
          }
          aria-label="Clear formatting"
          title="Clear formatting"
        >
          <RemoveFormatting />
        </Button>
      </div>
      <EditorContent editor={editor} />
      <p className="text-muted-foreground text-xs">
        <Trans
          id="editor.richtext.hint"
          message="Formatting applies to the selected text."
        />
      </p>
    </div>
  );
}

function ToolbarToggle({
  testId,
  label,
  pressed,
  disabled,
  onToggle,
  children,
}: {
  readonly testId: string;
  readonly label: string;
  readonly pressed: boolean;
  readonly disabled: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Toggle
      size="sm"
      data-testid={testId}
      title={label}
      aria-label={label}
      pressed={pressed}
      disabled={disabled}
      onPressedChange={onToggle}
    >
      {children}
    </Toggle>
  );
}

// Convert the current block to a paragraph or a heading level. "paragraph"
// and "h1"–"h6" are the values the format dropdown emits.
function setFormat(editor: Editor | null, value: string): void {
  if (!editor) return;
  const chain = editor.chain().focus();
  const level = HEADING_LEVELS.find((l) => `h${l}` === value);
  if (level) {
    chain.setHeading({ level }).run();
  } else {
    chain.setParagraph().run();
  }
}

/**
 * Focusing the URL input pulls DOM focus out of the editor, so the selection is
 * snapshotted on open and restored before mutating the link mark.
 */
export function LinkPopover({
  editor,
  active,
  disabled,
  testId,
}: {
  readonly editor: Editor | null;
  readonly active: boolean;
  readonly disabled: boolean;
  readonly testId: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");
  const range = useRef<{ from: number; to: number } | null>(null);

  const handleOpenChange = (next: boolean): void => {
    if (next && editor) {
      const { from, to } = editor.state.selection;
      range.current = { from, to };
      setHref((editor.getAttributes("link").href as string | undefined) ?? "");
    }
    setOpen(next);
  };

  // `extendMarkRange` widens a caret inside a link to the whole link. An empty
  // url removes it.
  const applyHref = (url: string): void => {
    if (!editor || !range.current) return;
    const chain = editor
      .chain()
      .focus()
      .setTextSelection(range.current)
      .extendMarkRange("link");
    if (url) chain.setMark("link", { href: url });
    else chain.unsetMark("link");
    chain.run();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Toggle
          size="sm"
          data-testid={`${testId}-link`}
          title="Link"
          aria-label="Link"
          pressed={active}
          disabled={disabled}
        >
          <Link2 />
        </Toggle>
      </PopoverTrigger>
      <PopoverContent variant="flush" className="w-72" align="start">
        <form
          className="flex items-center gap-2 p-2"
          data-testid={`${testId}-link-form`}
          onSubmit={(e) => {
            e.preventDefault();
            applyHref(href.trim());
          }}
        >
          <Input
            className="h-8"
            data-testid={`${testId}-link-url`}
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="https://example.com"
            autoFocus
          />
          <Button
            type="submit"
            size="sm"
            className="shrink-0"
            data-testid={`${testId}-link-apply`}
          >
            Apply
          </Button>
          {active ? (
            <Button
              type="button"
              variant="destructive-ghost"
              size="icon-sm"
              className="shrink-0"
              data-testid={`${testId}-link-remove`}
              title="Remove link"
              aria-label="Remove link"
              onClick={() => applyHref("")}
            >
              <Trash2 />
            </Button>
          ) : null}
        </form>
      </PopoverContent>
    </Popover>
  );
}
