import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000,
    coverage: {
      reporter: ["text", "html"],
      exclude: ["node_modules/", "tests/", "*.config.ts", "bin/"],
    },
  },
});
