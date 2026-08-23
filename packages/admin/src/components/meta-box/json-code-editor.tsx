import type { ReactNode } from "react";
import { json } from "@codemirror/lang-json";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";

// CodeMirror wants a concrete light/dark. Read the resolved theme the
// `ThemeProvider` stamps onto the document root (`.dark`) — that already
// collapses the "system" setting to a real class — falling back to the OS
// preference, then light. Reading the DOM keeps this decoupled from the
// theme context (it renders correctly in isolation too).
function resolveColorScheme(): "dark" | "light" {
  if (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  ) {
    return "dark";
  }
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

/**
 * Syntax-highlighted, editable JSON control backing the metabox `json()`
 * field. A thin controlled wrapper over CodeMirror — it owns the editing
 * surface (gutter, bracket matching, highlighting) and reports the raw
 * text; parsing / validation stays with the caller (`JsonControl`). Loaded
 * lazily so a form without a JSON field never pulls the CodeMirror chunk.
 */
function JsonCodeEditor({
  value,
  onChange,
  disabled,
  ariaInvalid,
  ariaLabel,
  testId,
}: {
  readonly value: string;
  readonly onChange: (raw: string) => void;
  readonly disabled: boolean;
  readonly ariaInvalid?: boolean;
  readonly ariaLabel?: string;
  readonly testId: string;
}): ReactNode {
  return (
    <div
      className="border-input overflow-hidden rounded-md border text-xs [&_.cm-editor]:min-h-32 [&_.cm-editor.cm-focused]:outline-none [&_.cm-gutters]:bg-transparent"
      data-testid={testId}
      aria-invalid={ariaInvalid}
    >
      <CodeMirror
        value={value}
        onChange={onChange}
        editable={!disabled}
        theme={resolveColorScheme()}
        extensions={[
          json(),
          // CodeMirror owns the editable element, so the wrapper's test id
          // can't reach it. Name the editing surface itself, or a test has no
          // testid-only way to type into the field.
          EditorView.contentAttributes.of({ "data-testid": `${testId}-code` }),
        ]}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
        }}
        aria-label={ariaLabel}
      />
    </div>
  );
}

export default JsonCodeEditor;
