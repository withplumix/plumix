import { resolve } from "node:path";

import { syncRoster } from "./roster.js";

await syncRoster(resolve(import.meta.dirname, ".."));
