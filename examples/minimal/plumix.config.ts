import { auth, plumix } from "plumix";
import { cloudflare, d1 } from "@plumix/runtime-cloudflare";

export default plumix({
  runtime: cloudflare(),
  // session: "auto" routes writes to primary, nearest replica for anon reads,
  // and resumes authenticated reads from a bookmark cookie for read-your-writes.
  database: d1({ binding: "DB", session: "auto" }),
  auth: auth({
    passkey: {
      rpName: "Plumix — Minimal",
      rpId: "localhost",
      origin: "http://localhost:8787",
    },
  }),
});
