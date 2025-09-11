import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { includeIgnoreFile } from "@eslint/compat";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import { fileURLToPath } from "node:url";
import { defineConfig } from "eslint/config";
import vitest from "@vitest/eslint-plugin";

const gitignorePath = fileURLToPath(new URL(".gitignore", import.meta.url));

// Restrict the TS "strict type-checked" presets to TS files only.
const tsTypeChecked = tseslint.configs.strictTypeChecked.map((c) => ({
  ...c,
  files: ["**/*.{ts,tsx,mts,cts}"],
}));

export default defineConfig(
  // Respect .gitignore
  includeIgnoreFile(gitignorePath),

  // Base JS rules
  { languageOptions: { globals: globals.node } },
  js.configs.recommended,
  tseslint.configs.strict,

  // TypeScript rules + typed linting (TS only)
  ...tsTypeChecked,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },

  // Tests: Vitest plugin
  {
    files: [
      "**/*.{test,spec}.{ts,tsx,js,mjs,cjs,mts,cts}",
      "tests/**/*.{ts,tsx,js,mjs,cjs,mts,cts}",
    ],
    ...vitest.configs.recommended,
    languageOptions: {
      globals: { ...vitest.environments.env.globals },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Additional rules
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,mts,cts}"],
    rules: {
      "no-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "no-return-assign": ["error", "always"],
      radix: ["error", "as-needed"],
      "guard-for-in": "error",
      "prefer-object-has-own": "error",
      "prefer-regex-literals": ["error", { disallowRedundantWrapping: true }],
      "require-unicode-regexp": "error",
      "no-extend-native": "error",
      "no-new-wrappers": "error",
      "no-implicit-coercion": ["error", { allow: ["!!"] }],
    },
  },

  // Prettier last
  eslintConfigPrettier,
);
