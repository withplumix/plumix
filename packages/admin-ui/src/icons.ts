// The shared icon set. Re-exports lucide-react so every consumer (admin,
// admin-editor, themes) pulls icons from one place at one catalog-pinned
// version, instead of each depending on lucide directly and drifting. lucide
// ships per-icon ESM modules, so `export *` stays tree-shakeable — bundlers
// keep only the icons a consumer actually imports.
export * from "lucide-react";
