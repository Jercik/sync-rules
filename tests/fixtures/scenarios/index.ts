// Content definitions for different file types and versions
export const CONTENT = {
  cursor: {
    basic:
      "# Cursor Rules\n- Use descriptive variable names\n- Add JSDoc comments",
    v1: "# Cursor Rules v1\n- Use short variable names\n- Minimize comments",
    v2: "# Cursor Rules v2\n- Use descriptive variable names\n- Add comprehensive JSDoc comments",
    descriptiveNames: "# Cursor Rules\n- Use descriptive names",
    v1Basic:
      "# Cursor Rules v1\n- Use descriptive variable names\n- Add basic JSDoc",
    v2Comprehensive:
      "# Cursor Rules v2\n- Use descriptive variable names\n- Add comprehensive JSDoc",
    shortNames: "# Cursor Rules\n- Use short names for quick iteration",
    rootTypeScript: "# Root Cursor Rules\n- Use TypeScript globally",
    rootTypeScriptStrict:
      "# Root Cursor Rules\n- Use TypeScript with strict mode",
  },
  cli: {
    basic:
      "# CLI Assistant Config\n- Use TypeScript for all code\n- Prefer async/await",
    jsCallbacks:
      "# CLI Assistant Config\n- Use JavaScript for quick prototypes\n- Use callbacks",
    v1Basic: "# CLI Assistant Config v1\n- Use TypeScript",
    v2AsyncAwait:
      "# CLI Assistant Config v2\n- Use TypeScript\n- Prefer async/await",
    typeScript: "# CLI Config\n- Use TypeScript",
    explicitTypes: "# Main CLI Rules\n- Prefer explicit types",
    typeInference: "# Main CLI Rules\n- Prefer type inference",
    jestTesting: "# Test CLI Rules\n- Use jest for testing",
  },
  style: {
    basic: "# Style Guide\n- Use consistent formatting",
  },
  kilocode: {
    functional: "# Kilocode Rules\n- Prefer functional programming",
    functionalStyle: "# Kilocode Rules\n- Prefer functional programming style",
    documentation: "# Documentation Rules\n- Write clear docs",
    validation: "# Config Rules\n- Validate all inputs",
  },
  custom: {
    teamConventions: "# Custom Rules\n- Follow team conventions",
  },
  local: {
    debugConsole: "# Local overrides\n- Allow console.log for debugging",
    apiEndpoints: "# Local overrides\n- Use different API endpoints",
  },
};
