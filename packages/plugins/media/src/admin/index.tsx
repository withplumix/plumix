// Plugin admin entry. Bundled by the plumix vite plugin into the host
// admin's plugin chunk. The plumix bundler namespace-imports this module
// and emits a `window.plumix.registerPluginPage("/media", MediaLibrary)`
// call into the synthesised admin chunk based on the `component:
// "MediaLibrary"` ref we passed to `ctx.registerAdminPage`. So the
// plugin's only job here is to expose the export by name.

export { MediaLibrary } from "./MediaLibrary.js";
