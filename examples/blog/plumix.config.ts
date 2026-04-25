import { blog } from "@plumix/plugin-blog";
import { pages } from "@plumix/plugin-pages";
import { cloudflare, d1 } from "@plumix/runtime-cloudflare";
import { auth, plumix } from "plumix";

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — Blog",
      rpId: "localhost",
      origin: "http://localhost:8787",
    },
  }),
  plugins: [blog, pages],
});
