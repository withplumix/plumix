// Bridges the editor canvas runtime into the `plumix` package's public
// exports so consumer apps don't need a direct dep on the workspace-internal
// `@plumix/admin-editor`. A bare re-export (unlike island-runtime's
// side-effect import) because the generated editor entry calls `bootEditor()`
// explicitly — the side effect runs from that call, not at module load.

export { bootEditor } from "@plumix/admin-editor";
