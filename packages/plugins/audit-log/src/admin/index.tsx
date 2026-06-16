// Plugin admin entry. The plumix vite plugin namespace-imports this
// module and emits a `window.plumix.registerPluginPage("/audit-log",
// AuditLogShell)` call into the synthesised admin chunk based on the
// `component: "AuditLogShell"` ref passed to `ctx.registerAdminPage`.
// All this entry has to do is expose the export by name — registering
// the page imperatively here as well would double-register it (the
// synthesised chunk runs this module body *and* its generated call),
// throwing AdminPluginRegistryError at admin boot. See the media
// plugin's admin entry for the canonical shape.

export { AuditLogShell } from "./AuditLogShell.js";
