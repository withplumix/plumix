import type { DevErrorFrame } from "./contract.js";

/**
 * The default when `PLUMIX_EDITOR` is unset: VS Code, the dominant editor, so
 * the link works out of the box with no configuration.
 */
const VSCODE_TEMPLATE = "vscode://file/{file}:{line}:{column}";

/**
 * The VS Code family puts the path in the URL; the JetBrains family and
 * Sublime take file and line as query parameters.
 */
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
 * `undefined` (no link) for `off` / `none`. A value with a `{file}`
 * placeholder is a custom format, returned verbatim; an unrecognized key falls
 * back to VS Code.
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
 * Links open the right file when the dev server's filesystem differs from the
 * editor host's: a container, a remote/SSH box, or a devcontainer.
 */
export interface EditorPathMap {
  readonly from: string;
  readonly to: string;
}

/**
 * `undefined` when either side of `from=>to` is empty: an empty `from` would
 * match every path, and an empty `to` truncates every path.
 */
export function resolveEditorPathMap(
  setting: string | undefined,
): EditorPathMap | undefined {
  if (!setting) return undefined;
  const sep = setting.indexOf("=>");
  if (sep === -1) return undefined;
  const from = stripTrailingSlash(setting.slice(0, sep));
  const to = stripTrailingSlash(setting.slice(sep + 2));
  if (from === "" || to === "") return undefined;
  return { from, to };
}

function stripTrailingSlash(path: string): string {
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * The prefix must land on a path boundary so `/workspace` doesn't rewrite
 * `/workspace-other`.
 */
function remapFilePath(file: string, map: EditorPathMap): string {
  if (file === map.from) return map.to;
  if (file.startsWith(`${map.from}/`)) {
    return map.to + file.slice(map.from.length);
  }
  return file;
}

/**
 * `encodeURI` keeps `?`, `&`, `#`, `=` unescaped, which could corrupt a path in
 * the query-string templates; accepted, as source paths practically never
 * contain them.
 */
export function buildEditorUrl(
  template: string,
  frame: Pick<DevErrorFrame, "file" | "line" | "column">,
  pathMap?: EditorPathMap,
): string {
  const file = pathMap ? remapFilePath(frame.file, pathMap) : frame.file;
  return template
    .replaceAll("{file}", encodeURI(file))
    .replaceAll("{line}", String(frame.line))
    .replaceAll("{column}", String(frame.column ?? 1));
}
