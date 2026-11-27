import { defineConfig } from "drizzle-kit";

// drizzle-kit generate / check: SQL migrations from src/schema, committed
// and reviewed in PRs (#9).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
});
