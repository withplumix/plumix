import type { Editor } from "@tiptap/react";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { Trans } from "@lingui/react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";

import { Button } from "@plumix/admin-ui/button";
import {
  Bold,
  Heading2,
  Heading3,
  Heading4,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  RemoveFormatting,
  Strikethrough,
  Underline,
} from "@plumix/admin-ui/icons";
import { Toggle } from "@plumix/admin-ui/toggle";

import { HEADING_LEVELS, richTextExtensions } from "./rich-text-extensions.js";

interface RichTextFieldProps {
  /** The block's body as an HTML string. */
  readonly value: string;
  /** Emits the serialized HTML on every edit. */
  readonly onChange: (html: string) => void;
  /** Stable testid for the field root (the inspector's per-input id). */
  readonly testId: string;
}

// The uniform marks: each toggles via toggleMark(name) and paints its pressed
// state from isActive(name), so one table drives the toolbar and the selector.
const MARKS = [
  { name: "bold", icon: Bold, testId: "bold" },
  { name: "italic", icon: Italic, testId: "italic" },
  { name: "underline", icon: Underline, testId: "underline" },
  { name: "strike", icon: Strikethrough, testId: "strike" },
  { name: "highlight", icon: Highlighter, testId: "highlight" },
] as const;

// The active-mark/-node flags the toolbar paints its pressed state from. Derived
// via useEditorState so the toolbar re-renders on selection changes without
// re-rendering on every keystroke.
interface ActiveState {
  readonly marks: Readonly<Record<string, boolean>>;
  readonly link: boolean;
  readonly bulletList: boolean;
  readonly orderedList: boolean;
  readonly headings: Readonly<Record<number, boolean>>;
}

const HEADING_ICON: Record<number, typeof Heading2> = {
  2: Heading2,
  3: Heading3,
  4: Heading4,
};

/**
 * Right-rail rich-text editor: a Tiptap instance over StarterKit nodes + the
 * shared core marks, serializing to the HTML string the block stores and
 * renders. The editor identity is stable — `useEditor` is created once and
 * external value changes are pushed in without emitting an update — so typing
 * never loses focus across the live patch loop's re-renders.
 */
export function RichTextField({
  value,
  onChange,
  testId,
}: RichTextFieldProps): ReactElement {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const editor = useEditor({
    extensions: richTextExtensions(),
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&_:focus]:outline-none",
        "data-testid": `${testId}-editor`,
      },
    },
    onUpdate: ({ editor }) => onChangeRef.current(editor.getHTML()),
  });

  // External value changes (undo/redo, switching to another block) sync into
  // the editor without re-emitting. The guard compares against getHTML(), so the
  // echo from our own onUpdate is a no-op and the caret never resets mid-type —
  // this rests on the host storing back the exact getHTML() string; any
  // re-serialization between onChange and `value` would defeat it.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

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
            headings: Object.fromEntries(
              HEADING_LEVELS.map((level) => [
                level,
                editor.isActive("heading", { level }),
              ]),
            ),
          }
        : null,
  });

  return (
    <div className="flex flex-col gap-1.5" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-0.5" role="toolbar">
        {HEADING_LEVELS.map((level) => {
          const Icon = HEADING_ICON[level] ?? Heading2;
          return (
            <ToolbarToggle
              key={level}
              testId={`${testId}-h${String(level)}`}
              pressed={active?.headings[level] ?? false}
              disabled={!editor}
              onToggle={() =>
                editor?.chain().focus().toggleHeading({ level }).run()
              }
            >
              <Icon />
            </ToolbarToggle>
          );
        })}
        {MARKS.map(({ name, icon: Icon, testId: suffix }) => (
          <ToolbarToggle
            key={name}
            testId={`${testId}-${suffix}`}
            pressed={active?.marks[name] ?? false}
            disabled={!editor}
            onToggle={() => editor?.chain().focus().toggleMark(name).run()}
          >
            <Icon />
          </ToolbarToggle>
        ))}
        <ToolbarToggle
          testId={`${testId}-bullet-list`}
          pressed={active?.bulletList ?? false}
          disabled={!editor}
          onToggle={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List />
        </ToolbarToggle>
        <ToolbarToggle
          testId={`${testId}-ordered-list`}
          pressed={active?.orderedList ?? false}
          disabled={!editor}
          onToggle={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered />
        </ToolbarToggle>
        <ToolbarToggle
          testId={`${testId}-link`}
          pressed={active?.link ?? false}
          disabled={!editor}
          onToggle={() => toggleLink(editor)}
        >
          <Link2 />
        </ToolbarToggle>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-8 p-0"
          data-testid={`${testId}-clear`}
          disabled={!editor}
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
  pressed,
  disabled,
  onToggle,
  children,
}: {
  readonly testId: string;
  readonly pressed: boolean;
  readonly disabled: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Toggle
      size="sm"
      data-testid={testId}
      pressed={pressed}
      disabled={disabled}
      onPressedChange={onToggle}
    >
      {children}
    </Toggle>
  );
}

// Toggle the link mark: drop it when the selection already carries one,
// otherwise wrap the selection in a prompted href. A blank/cancelled prompt is
// a no-op.
function toggleLink(editor: Editor | null): void {
  if (!editor) return;
  if (editor.isActive("link")) {
    editor.chain().focus().unsetMark("link").run();
    return;
  }
  const href = window.prompt("Link URL")?.trim();
  if (!href) return;
  editor.chain().focus().setMark("link", { href }).run();
}
