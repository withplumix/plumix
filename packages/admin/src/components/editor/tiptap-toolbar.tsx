import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button.js";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
} from "lucide-react";

// Toolbar buttons declare a `requires.mark` or `requires.node` —
// the button surfaces only when the allowlist names that type. An
// undefined allowlist (canvas mode) surfaces every button.
//
// Mirrors WP's kses allowed-protocols for `<a href>`. StarterKit's
// Link `protocols` option filters auto-linkification; this regex
// gates manual entries from the toolbar's prompt.
const SAFE_URL_RE = /^(https?:|mailto:|\/|#)/i;
function isSafeUrl(href: string): boolean {
  return SAFE_URL_RE.test(href.trim());
}

interface ToolbarButtonSpec {
  readonly label: string;
  readonly testId?: string;
  readonly requires: { readonly mark?: string; readonly node?: string };
  readonly icon: ReactNode;
  readonly onClick: (editor: Editor) => void;
  readonly isActive: (editor: Editor) => boolean;
}

const TOOLBAR_BUTTONS: readonly ToolbarButtonSpec[] = [
  {
    label: "Bold",
    testId: "tiptap-toolbar-bold",
    requires: { mark: "bold" },
    icon: <Bold className="size-4" />,
    onClick: (editor) => editor.chain().focus().toggleBold().run(),
    isActive: (editor) => editor.isActive("bold"),
  },
  {
    label: "Italic",
    testId: "tiptap-toolbar-italic",
    requires: { mark: "italic" },
    icon: <Italic className="size-4" />,
    onClick: (editor) => editor.chain().focus().toggleItalic().run(),
    isActive: (editor) => editor.isActive("italic"),
  },
  {
    label: "Heading 2",
    testId: "tiptap-toolbar-h2",
    requires: { node: "heading" },
    icon: <Heading2 className="size-4" />,
    onClick: (editor) =>
      editor.chain().focus().toggleHeading({ level: 2 }).run(),
    isActive: (editor) => editor.isActive("heading", { level: 2 }),
  },
  {
    label: "Heading 3",
    testId: "tiptap-toolbar-h3",
    requires: { node: "heading" },
    icon: <Heading3 className="size-4" />,
    onClick: (editor) =>
      editor.chain().focus().toggleHeading({ level: 3 }).run(),
    isActive: (editor) => editor.isActive("heading", { level: 3 }),
  },
  {
    label: "Bullet list",
    testId: "tiptap-toolbar-bullet",
    requires: { node: "bulletList" },
    icon: <List className="size-4" />,
    onClick: (editor) => editor.chain().focus().toggleBulletList().run(),
    isActive: (editor) => editor.isActive("bulletList"),
  },
  {
    label: "Numbered list",
    testId: "tiptap-toolbar-ordered",
    requires: { node: "orderedList" },
    icon: <ListOrdered className="size-4" />,
    onClick: (editor) => editor.chain().focus().toggleOrderedList().run(),
    isActive: (editor) => editor.isActive("orderedList"),
  },
  {
    label: "Link",
    testId: "tiptap-toolbar-link",
    requires: { mark: "link" },
    icon: <LinkIcon className="size-4" />,
    onClick: (editor) => {
      // Browser `prompt()` is a compromise — it's accessible by default
      // and sidesteps building a floating link popover for the MVP. A
      // future PR can swap in a proper shadcn Popover + validated URL
      // input. Empty string unsets the mark (Tiptap convention).
      const previous = editor.getAttributes("link").href as string | undefined;
      const href = window.prompt("URL", previous ?? "https://");
      if (href === null) return;
      if (href === "") {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
        return;
      }
      if (!isSafeUrl(href)) {
        window.alert("Links must start with http://, https://, or mailto:");
        return;
      }
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    },
    isActive: (editor) => editor.isActive("link"),
  },
];

interface AllowlistInput {
  readonly marks?: readonly string[];
  readonly nodes?: readonly string[];
}

function buttonAllowed(
  spec: ToolbarButtonSpec,
  allowlist: AllowlistInput | undefined,
): boolean {
  if (allowlist === undefined) return true;
  const { mark, node } = spec.requires;
  if (mark !== undefined) return (allowlist.marks ?? []).includes(mark);
  if (node !== undefined) return (allowlist.nodes ?? []).includes(node);
  return true;
}

export function TiptapToolbar({
  editor,
  disabled,
  allowlist,
}: {
  readonly editor: Editor;
  readonly disabled: boolean;
  readonly allowlist?: AllowlistInput;
}): ReactNode {
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      data-testid="post-editor-toolbar"
      className="flex flex-wrap items-center gap-1 p-1"
    >
      {TOOLBAR_BUTTONS.filter((spec) => buttonAllowed(spec, allowlist)).map(
        (spec) => (
          <ToolbarButton
            key={spec.label}
            label={spec.label}
            testId={spec.testId}
            onClick={() => spec.onClick(editor)}
            isActive={spec.isActive(editor)}
            disabled={disabled}
          >
            {spec.icon}
          </ToolbarButton>
        ),
      )}
    </div>
  );
}

function ToolbarButton({
  label,
  testId,
  onClick,
  isActive,
  disabled,
  children,
}: {
  readonly label: string;
  readonly testId?: string;
  readonly onClick: () => void;
  readonly isActive: boolean;
  readonly disabled: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <Button
      type="button"
      size="sm"
      variant={isActive ? "default" : "ghost"}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isActive}
      aria-label={label}
      title={label}
      data-testid={testId}
      className="size-8 p-0"
    >
      {children}
    </Button>
  );
}
