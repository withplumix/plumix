// `coreMarks` (pure metadata) and `coreMarkExtensions` (Tiptap) live in
// separate modules so the server can read the catalogue without pulling the
// editor's ProseMirror graph into the worker bundle (#1205). Both are re-exported
// here as the single `marks/core` entry point.
export { coreMarks } from "./metadata.js";
export { coreMarkExtensions } from "./extensions.js";
