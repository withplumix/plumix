import { plumix } from "plumix";

import { blog } from "@plumix/plugin-blog";
import { demoPreset } from "@plumix/runtime-cloudflare/demo";

import { demoTheme } from "./theme";

export default plumix({
  plugins: [blog],
  theme: demoTheme,
  // The whole point of this playground: exercise the demo sandbox end to end.
  // Turnstile is omitted, so `/_demo/init` runs unguarded — the e2e provisions
  // a session without solving a challenge.
  ...demoPreset({
    binding: "DEMO_DO",
    loadSql: () => import("./demo-sql").then((m) => m.demoSql()),
  }),
});
