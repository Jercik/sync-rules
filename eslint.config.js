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
  {
    languageOptions: {
      ecmaVersion: "latest", // Explicit for clarity
      sourceType: "module", // Explicit for clarity
      globals: globals.node,
    },
  },
  js.configs.recommended,
  tseslint.configs.strict,

  // TypeScript rules + typed linting (TS only)
  ...tsTypeChecked,
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.js", "*.mjs", "*.ts", "*.mts"], // Lint root config files
        },
        tsconfigRootDir: import.meta.dirname, // Required for Project Service
      },
    },
  },

  // Tests: Vitest plugin
  {
    files: [
      "**/*.{test,spec}.{ts,tsx,js,mjs,cjs,mts,cts}",
      "tests/**/*.{ts,tsx,js,mjs,cjs,mts,cts}",
    ],
    plugins: { vitest },
    extends: [vitest.configs.recommended], // Modern extends property
    languageOptions: {
      globals: { ...vitest.environments.env.globals },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
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
