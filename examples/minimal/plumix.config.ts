import { plumix } from "plumix";
import { cloudflare, d1 } from "@plumix/runtime-cloudflare";

export default plumix({
  runtime: cloudflare(),
  database: d1({ binding: "DB" }),
  auth: {
    passkey: {
      rpName: "Plumix — Minimal",
      rpId: "localhost",
      origin: "http://localhost:8787",
    },
  },
});
