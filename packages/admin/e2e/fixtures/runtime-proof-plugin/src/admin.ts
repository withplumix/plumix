// Fixture plugin's adminEntry — what `plumix.config.ts` would point at
// in a real plugin's package. Registers the page component into
// `window.plumix`, exactly the same call any plugin author would make.

import { MediaLibrary } from "./MediaLibrary.js";

window.plumix?.registerPluginPage("/__runtime-proof", MediaLibrary);
