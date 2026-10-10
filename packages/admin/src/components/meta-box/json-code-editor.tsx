import type { ReactNode } from "react";
import { json } from "@codemirror/lang-json";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";

/**
 * Reads the DOM rather than the theme context so it also renders correctly in
 * isolation.
 */
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

/** Reports raw text; parsing stays with the caller. */
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
