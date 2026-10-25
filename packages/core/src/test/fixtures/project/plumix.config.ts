// A project's config as `testSite()` finds it in the working directory. Every
// slot the kit fakes throws when used, so a test that touches one fails.
import { auth } from "../../../auth/config.js";
import { definePlugin } from "../../../plugin/define.js";
import { plumix } from "../../../runtime/define-config.js";
import { defaultTestTheme } from "../../default-theme.js";

const notes = definePlugin("notes", {
  setup: (ctx) => {
    ctx.registerEntryType("note", { label: "Notes", isPublic: true });
  },
});

function opened(slot: string): () => never {
  return () => {
    throw new Error(`The project's ${slot} was connected.`);
  };
}

export default plumix({
  runtime: { name: "project", handler: {}, generateEntry: () => "" },
  database: {
    kind: "file",
    connect: () => {
      throw new Error("The project's file database was opened.");
    },
  },
  cdn: { kind: "project", connect: opened("cdn") },
  storage: { kind: "project", connect: opened("storage") },
  kv: { kind: "project", connect: opened("kv") },
  mailer: {
    send: () => {
      throw new Error("The project's mailer was used.");
    },
  },
  auth: auth({
    passkey: {
      rpName: "Project",
      rpId: "project.example",
      origin: "https://project.example",
    },
  }),
  theme: defaultTestTheme,
  plugins: [notes],
});
