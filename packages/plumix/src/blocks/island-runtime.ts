// A side-effect import: the module registers the island custom element on load,
// and the bootstrap is idempotent, so there is nothing to re-export.

import "@plumix/core/blocks/island-runtime";
