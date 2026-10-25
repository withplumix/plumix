import { auth } from "../../../auth/config.js";
import { definePlugin } from "../../../plugin/define.js";
import { plumix } from "../../../runtime/define-config.js";
import { defaultTestTheme } from "../../default-theme.js";

const notes = definePlugin("notes", {
  setup: (ctx) => {
    ctx.registerEntryType("note", { label: "Notes", isPublic: true });
  },
});

function throwsWhenConnected(slot: string): () => never {
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
  cdn: { kind: "project", connect: throwsWhenConnected("cdn") },
  storage: { kind: "project", connect: throwsWhenConnected("storage") },
  kv: { kind: "project", connect: throwsWhenConnected("kv") },
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
