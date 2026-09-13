---
"@plumix/core": patch
---

Fixes `block:before_render` and `block:after_render` never firing. Both filters are documented and declared on `FilterRegistry`, but nothing called them — a plugin that subscribed via `addFilter("block:before_render", ...)` registered successfully and was never invoked. They now fire synchronously around every block's React element as `renderBlockTree` walks the content tree, letting a plugin decorate or replace a block's rendered output.
