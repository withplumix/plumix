// Source import (not @plumix/core/lingui): this config is jiti-loaded
// by tools that run before any build — knip executing vite.config.ts,
// a cold-clone `vite dev` — so it can't depend on core's dist. The
// subpath export exists for external consumers, who install dist.
import { defineLinguiConfig } from "../core/src/lingui/index.js";

export default defineLinguiConfig();
