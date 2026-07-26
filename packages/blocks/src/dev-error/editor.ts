import type { DevErrorFrame } from "./contract.js";

// Open-in-editor via editor URL scheme (#1581): each resolved frame links to a
// `scheme://…` URL the OS hands to the developer's editor — a plain anchor, no
// server round-trip, no dependency. The scheme is chosen by the dev-only
// `PLUMIX_EDITOR` setting: a known-editor key, or a custom format string. Shared
// here so the server page (core) and the client overlay (#1603) build the same
// links.

// The default when `PLUMIX_EDITOR` is unset: VS Code, the dominant editor, so
// the link works out of the box with no configuration.
const VSCODE_TEMPLATE = "vscode://file/{file}:{line}:{column}";

// Built-in URL templates keyed by known-editor name. The VS Code family shares
// the `scheme://file/{path}:{line}:{column}` shape; the JetBrains family and
// Sublime take the file and line as query parameters instead. `{file}`,
// `{line}`, and `{column}` are filled per frame by `buildEditorUrl`.
const EDITOR_TEMPLATES: Readonly<Record<string, string>> = {
  vscode: VSCODE_TEMPLATE,
  "vscode-insiders": "vscode-insiders://file/{file}:{line}:{column}",
  cursor: "cursor://file/{file}:{line}:{column}",
  windsurf: "windsurf://file/{file}:{line}:{column}",
  zed: "zed://file/{file}:{line}:{column}",
  idea: "idea://open?file={file}&line={line}",
  phpstorm: "phpstorm://open?file={file}&line={line}",
  webstorm: "webstorm://open?file={file}&line={line}",
  sublime: "subl://open?url=file://{file}&line={line}",
};

/**
 * Resolve the `PLUMIX_EDITOR` setting to a URL-format template, or `undefined`
 * to render no link at all. `off` / `none` opt out — for a developer whose
 * editor has no URL scheme. A value carrying a `{file}` placeholder is a custom
 * format string, returned verbatim (the escape hatch for any editor with no code
 * change). A bare known-editor key maps to its built-in template. Anything else
 * — an unset value or an unrecognized key — falls back to the default (VS Code),
 * so the page shows a working link out of the box.
 */
export function resolveEditorTemplate(
  setting: string | undefined,
): string | undefined {
  if (setting === undefined) return VSCODE_TEMPLATE;
  if (setting === "off" || setting === "none") return undefined;
  if (setting.includes("{file}")) return setting;
  return EDITOR_TEMPLATES[setting] ?? VSCODE_TEMPLATE;
}

/**
 * Build the concrete open-in-editor href for a frame from a resolved template.
 * The path is escaped with `encodeURI` — spaces and non-ASCII escape, while the
 * `/` separators and a Windows drive colon stay intact (`vscode://file/C:/…`).
 * `encodeURI` leaves the URI-reserved set (`?`, `&`, `#`, `=`) unescaped, which
 * a path fed into the query-string templates (`idea`, `sublime`) could in
 * principle corrupt — accepted, since source paths practically never contain
 * those and the path-style VS Code family needs the reserved chars preserved.
 * `{column}` defaults to 1 when the frame carried no column.
 */
export function buildEditorUrl(
  template: string,
  frame: Pick<DevErrorFrame, "file" | "line" | "column">,
): string {
  return template
    .replaceAll("{file}", encodeURI(frame.file))
    .replaceAll("{line}", String(frame.line))
    .replaceAll("{column}", String(frame.column ?? 1));
}
