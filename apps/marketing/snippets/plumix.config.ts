import { plumix } from "plumix";
import { auth } from "plumix/auth";

import { blog } from "@plumix/plugin-blog";
import { media } from "@plumix/plugin-media";
import { pages } from "@plumix/plugin-pages";
import { cloudflare, d1, r2 } from "@plumix/runtime-cloudflare";

import { theme } from "./theme";

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB" }),
  storage: r2({ binding: "MEDIA" }),
  auth: auth({
    passkey: {
      rpName: "My site",
      rpId: "example.com",
      origin: "https://example.com",
    },
  }),
  plugins: [blog(), pages, media()],
  theme,
});
