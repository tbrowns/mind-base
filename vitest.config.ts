import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" -> "./*" mapping in tsconfig.json.
    alias: {
      "@": path.resolve(__dirname, "."),
      // `server-only` throws by design when imported outside a server bundle.
      // Tests exercise those modules directly, so stub it out.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
