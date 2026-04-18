import { plumix } from "plumix";
import { auth } from "@plumix/core/auth";
import { cloudflare, d1 } from "@plumix/runtime-cloudflare";

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — Minimal",
      rpId: "localhost",
      origin: "http://localhost:8787",
    },
  }),
});
