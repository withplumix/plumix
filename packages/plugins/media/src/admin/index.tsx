// Plugin admin entry. The plumix vite plugin namespace-imports this module
// into the per-site admin chunk and synthesises the `registerPluginPage` and
// `registerPluginFieldType` calls from this plugin's `ctx.registerAdminPage`
// and `ctx.registerFieldType` declarations — so re-exporting each component by
// the name the declaration carries is the whole job. Registering imperatively
// here would register a second time.

export { FocalPointField } from "./FocalPointField.js";
export { MediaLibrary } from "./MediaLibrary.js";
export { MediaListPickerField } from "./MediaListPickerField.js";
export { MediaPickerField } from "./MediaPickerField.js";
export { MediaUrlField } from "./MediaUrlField.js";
