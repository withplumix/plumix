---
"plumix": patch
---

Fixes dashboard widgets declared with `ctx.registerDashboardWidget` never rendering: the admin now mounts the component the widget's `component` names from the plugin's `adminEntry`.
