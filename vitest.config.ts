import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/helpers/setup.ts"],
    testTimeout: 30000,
    coverage: {
      reporter: ["text", "html"],
      exclude: ["node_modules/", "tests/", "*.config.ts", "bin/"],
    },
  },
});
