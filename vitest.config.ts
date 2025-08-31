import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30000,
    coverage: {
      reporter: ["text", "html"],
      exclude: ["bin/*", "src/cli/main.ts", ...coverageConfigDefaults.exclude],
    },
  },
});
