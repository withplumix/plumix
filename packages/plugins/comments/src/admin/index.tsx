// Expose the export only: the synthesised admin chunk already registers the
// page, and registering it here too throws AdminPluginRegistryError at boot.

export { CommentsShell } from "./CommentsShell.js";
