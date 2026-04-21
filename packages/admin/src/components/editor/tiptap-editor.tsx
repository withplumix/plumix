import type { Content } from "@tiptap/react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button.js";
import { cn } from "@/lib/utils.js";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
} from "lucide-react";

// Minimal Tiptap editor. Content round-trips as a JSON-encoded ProseMirror
// document — the public resolver walks the JSON against a node-type
// allowlist, which is the trust boundary that keeps `<script>` and other
// untrusted HTML out of public pages even if a contributor bypasses the
// editor via the RPC.
export function TiptapEditor({
  value,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  readonly value: string;
  readonly onChange: (json: string) => void;
  readonly disabled?: boolean;
  readonly ariaLabel?: string;
}): ReactNode {
  const editor = useEditor({
    extensions: [
      // StarterKit v3 bundles Link; keep it configured here so the toolbar
      // button's behaviour (openOnClick off so admins can freely edit,
      // safe rel attrs on user-entered hrefs) is explicit. Whitelist URL
      // schemes — defense-in-depth inside the admin; the public walker
      // re-checks on render.
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          protocols: ["http", "https", "mailto"],
          HTMLAttributes: {
            rel: "noopener noreferrer nofollow",
            target: "_blank",
          },
        },
      }),
    ],
    content: parseContent(value),
    editable: !disabled,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm dark:prose-invert max-w-none min-h-40 p-3 focus-visible:outline-none",
        "aria-label": ariaLabel ?? "Post content",
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange(JSON.stringify(e.getJSON()));
    },
  });

  // Sync external value changes (e.g., loading an existing post) into the
  // editor without a render-time setContent — that'd fight the user's
  // cursor. Only updates when the incoming JSON genuinely differs.
  useEffect(() => {
    const current = JSON.stringify(editor.getJSON());
    if (current === value) return;
    editor.commands.setContent(parseContent(value));
  }, [editor, value]);

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  return (
    <div
      className={cn(
        "bg-background rounded-md border",
        disabled && "opacity-60",
      )}
    >
      <Toolbar editor={editor} disabled={disabled} />
      <div className="border-t">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({
  editor,
  disabled,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>;
  disabled: boolean;
}): ReactNode {
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      data-testid="post-editor-toolbar"
      className="flex flex-wrap items-center gap-1 p-1"
    >
      <ToolbarButton
        label="Bold"
        testId="post-editor-toolbar-bold"
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        disabled={disabled}
      >
        <Bold className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        disabled={disabled}
      >
        <Italic className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 2"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive("heading", { level: 2 })}
        disabled={disabled}
      >
        <Heading2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Heading 3"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive("heading", { level: 3 })}
        disabled={disabled}
      >
        <Heading3 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Bullet list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        disabled={disabled}
      >
        <List className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        disabled={disabled}
      >
        <ListOrdered className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Link"
        onClick={() => {
          // Browser `prompt()` is a compromise — it's accessible by default
          // and sidesteps building a floating link popover for the MVP. A
          // future PR can swap in a proper shadcn Popover + validated URL
          // input. Empty string unsets the mark (Tiptap convention).
          const previous = editor.getAttributes("link").href as
            | string
            | undefined;
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
          editor
            .chain()
            .focus()
            .extendMarkRange("link")
            .setLink({ href })
            .run();
        }}
        isActive={editor.isActive("link")}
        disabled={disabled}
      >
        <LinkIcon className="size-4" />
      </ToolbarButton>
    </div>
  );
}

// Allowlist URL schemes for the Link toolbar — blocks `javascript:`,
// `data:`, and other executable protocols even though StarterKit's Link
// protocols option filters auto-linkification separately. Matches WP's
// kses allowed-protocols for `<a href>`.
const SAFE_URL_RE = /^(https?:|mailto:|\/|#)/i;
function isSafeUrl(href: string): boolean {
  return SAFE_URL_RE.test(href.trim());
}

// Empty or malformed payloads render as an empty doc rather than crash
// the editor — matches Tiptap's own tolerance for `null` on setContent.
function parseContent(value: string): Content {
  if (value === "") return null;
  try {
    return JSON.parse(value) as Content;
  } catch {
    return null;
  }
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
