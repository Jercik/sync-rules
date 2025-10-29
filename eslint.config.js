import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { includeIgnoreFile } from "@eslint/compat";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import { fileURLToPath } from "node:url";
import { defineConfig } from "eslint/config";
import vitest from "@vitest/eslint-plugin";

const gitignorePath = fileURLToPath(new URL(".gitignore", import.meta.url));

export default defineConfig(
  // Respect .gitignore
  includeIgnoreFile(gitignorePath, "Copy patterns from .gitignore"),

  // Base config for all JS/TS files
  {
    name: "Base config for all JS/TS files",
    files: ["**/*.{js,mjs,cjs,ts,tsx,mts,cts}"],
    extends: [js.configs.recommended, tseslint.configs.strictTypeChecked],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
      },
    },
  },

  // Config files - disable type-aware linting
  {
    name: "Config files - disable type-aware linting",
    files: ["*.config.{js,ts,mts,cts}"],
    ...tseslint.configs.disableTypeChecked,
  },

  // Tests: Vitest plugin
  {
    files: [
      "**/*.{test,spec}.{ts,tsx,js,mjs,cjs,mts,cts}",
      "tests/**/*.{ts,tsx,js,mjs,cjs,mts,cts}",
    ],
    plugins: { vitest },
    extends: [vitest.configs.recommended],
    languageOptions: {
      globals: { ...vitest.environments.env.globals },
    },
  },

  // Additional security and quality rules
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,mts,cts}"],
    rules: {
      // Security rules
      "no-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",

      // Correctness rules
      "no-return-assign": ["error", "always"],
      radix: ["error", "as-needed"],
      "guard-for-in": "error",
      "prefer-object-has-own": "error",

      // Clarity rules
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
