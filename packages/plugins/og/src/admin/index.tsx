// Plugin admin entry. The plumix vite plugin namespace-imports this module
// into the per-site admin chunk and synthesises the `registerPluginFieldType`
// call from this plugin's `ctx.registerFieldType` declaration — so re-exporting
// the component by the name the declaration carries is the whole job.
// Registering imperatively here would register a second time.

export { CardPreviewField } from "./CardPreviewField.js";
