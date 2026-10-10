// Separate modules so the server reads the catalogue without pulling the
// editor's ProseMirror graph into the worker bundle.
export { coreMarks } from "./metadata.js";
export { coreMarkExtensions } from "./extensions.js";
