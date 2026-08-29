// Plugin admin entry. The plumix vite plugin namespace-imports this
// module into the per-site admin chunk and synthesises the
// `registerPluginFieldType("tel", TelField)` call from this plugin's
// `ctx.registerFieldType` declaration — so re-exporting the component by
// name is the whole job. Registering imperatively here would register a
// second time.

export { SubmissionsShell } from "./SubmissionsShell.js";
export { TelField } from "./TelField.js";
