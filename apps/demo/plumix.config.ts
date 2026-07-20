import { consoleMailer, plumix } from "plumix";

import { blog } from "@plumix/plugin-blog";
import { comments } from "@plumix/plugin-comments";
import { media } from "@plumix/plugin-media";
import { menu } from "@plumix/plugin-menu";
import { pages } from "@plumix/plugin-pages";
import { edge, images, r2 } from "@plumix/runtime-cloudflare";
import { demoPreset } from "@plumix/runtime-cloudflare/demo";

import { blogTheme } from "./theme";

const readEnv = (env: unknown, name: string): string =>
  (env as Record<string, string | undefined>)[name] ?? "";

export default plumix({
  // Presigned uploads, image transforms and edge cache stay dormant until
  // their env keys are attached (see each primitive's docs); until then media
  // routes through the worker and public pages render live.
  storage: r2({ binding: "MEDIA" }),
  imageDelivery: images(),
  cache: edge({ ttl: 3600, staleWhileRevalidate: 86400 }),
  mailer: consoleMailer(),
  plugins: [
    blog,
    comments({ entryTypes: ["post"] }),
    pages,
    media(),
    menu({
      locations: {
        primary: { label: "Primary" },
        footer: { label: "Footer" },
      },
    }),
  ],
  theme: blogTheme,
  // Deploys this example as the anonymous demo sandbox: provides runtime /
  // database / auth as the per-session Durable Object, synthetic admin, and
  // demo runtime wrapper. Folded in unconditionally for now — see #1351 for
  // decoupling this from the scaffolder template.
  ...demoPreset({
    binding: "DEMO_DO",
    loadSql: () => import("./demo-sql").then((m) => m.demoSql()),
    // Turnstile is active only when keys are present in the env; local dev and
    // e2e run without them (no widget, no verification). Set the two secrets
    // on the deploy to gate `/_demo/init` against bots.
    turnstile: {
      siteKey: (env) => readEnv(env, "TURNSTILE_SITE_KEY"),
      secretKey: (env) => readEnv(env, "TURNSTILE_SECRET_KEY"),
    },
  }),
});
