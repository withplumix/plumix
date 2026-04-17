import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  casing: "snake_case",
  schema: "./src/db/schema/index.ts",
  out: "./.drizzle/migrations",
});
