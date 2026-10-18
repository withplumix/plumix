import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, it } from "vitest";

import { dynamicImportInLoadOnce } from "./dynamic-import-in-load-once.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

new RuleTester({
  languageOptions: { parser: tseslint.parser },
}).run("plumix/dynamic-import-in-load-once", dynamicImportInLoadOnce, {
  valid: [
    'const load = loadOnce(() => import("./heavy.js"));',
    'const load = loadOnce(async () => (await import("./heavy.js")).default);',
    'const load = loadOnce(() => import("./a.js").then((m) => m.build(1)));',
    'const load = process.env.PLUMIX_DEV ? loadOnce(() => import("./dev.js")) : undefined;',
    'const Editor = lazy(() => import("./editor.js"));',
    'const Editor = React.lazy(() => import("./editor.js"));',
    'type Routes = typeof import("./routes.js");',
  ],
  invalid: [
    {
      code: 'async function handle() { const { run } = await import("x"); return run(); }',
      errors: [{ messageId: "outsideLoadOnce" }],
    },
    {
      code: 'let routes; const flows = () => (routes ??= import("./flow-routes.js"));',
      errors: [{ messageId: "outsideLoadOnce" }],
    },
    {
      code: 'const load = loadOnce(async () => (request) => import("./per-call.js"));',
      errors: [{ messageId: "outsideLoadOnce" }],
    },
    {
      code: 'const load = memo(() => import("./heavy.js"));',
      errors: [{ messageId: "outsideLoadOnce" }],
    },
  ],
});
