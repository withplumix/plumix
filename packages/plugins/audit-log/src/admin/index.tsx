// Only expose the export: the synthesised admin chunk registers the page, and
// registering it here too throws AdminPluginRegistryError at boot.

export { AuditLogShell } from "./AuditLogShell.js";
