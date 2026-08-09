---
"@plumix/core": patch
---

Fix a flash of unstyled content (FOUC) on first paint in `plumix dev`.

Theme stylesheets declared via `defineTheme({ css: ["./theme/app.css"] })` were
delivered in dev only through the client-entry `<script>`, which side-effect-
imports the CSS so Vite injects `<style>` tags after hydration — the page painted
unstyled for a moment, then snapped in. The dev SSR response now also links each
resolvable theme CSS path with a render-blocking `<link rel="stylesheet">` in
`<head>`, so the first frame is styled, matching the production build.

The client-entry `<script>` still loads, so CSS hot-module replacement is
unchanged. Aliased (`~`, `@/`) and npm-scope (`@scope/pkg`) CSS specifiers keep
riding in on that import, since a browser `<link>` cannot resolve them.
