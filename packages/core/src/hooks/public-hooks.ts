// Anchors every public core hook's type augmentation into the published
// declaration graph (#1698).
//
// Each hook's `declare module "../hooks/types.js"` augmentation lives next to
// the code that fires it. That augmentation only reaches a consumer's registry
// if the declaring module's `.d.ts` is in the closure reachable from the package
// barrel — and tsc strips modules reached only through value or `import type`
// edges, so their augmentations never load downstream. A side-effect import is
// the edge tsc preserves (same idiom as `./template-deps-core.js`). Add a line
// here when a new hook joins the public plugin API; the docs roster's
// `FILTER_HOOKS`/`ACTION_HOOKS` binding fails otherwise.
import "../admin-bar/types.js"; // admin_bar:nodes
import "../dev/debug-bar/types.js"; // debug_bar:panels
import "../dev/server/hints/types.js"; // error_page:hints
import "../dev/server/panels/types.js"; // error_page:panels
import "../route/render/render-template.js"; // render:document
import "../route/resolve.js"; // resolve:{single,archive,term,author,date,front-page,search}:data
import "../seo/robots.js"; // seo:robots-txt
import "../seo/sitemap.js"; // seo:sitemap:urls
import "../theme.js"; // theme:document, theme:ready
import "./block-render.js"; // block:before_render, block:after_render, blocks:loader:error
