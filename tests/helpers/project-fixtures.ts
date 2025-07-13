import * as fs from "fs/promises";
import * as path from "path";
import { createTestProject } from "./setup.ts";
import type { FileContent } from "./setup.ts";
import type { Manifest } from "../../src/utils/manifest-validator.ts";

/**
 * Creates a test project with a manifest file and optional additional files.
 * 
 * @param name Project name
 * @param manifest Manifest object to write to .kilocode/manifest.json
 * @param additionalFiles Optional additional files to create
 * @returns Path to the created project
 */
export async function createProjectWithManifest(
  name: string,
  manifest: Manifest,
  additionalFiles: Record<string, FileContent> = {}
): Promise<string> {
  const files: Record<string, FileContent> = {
    ".kilocode/manifest.json": JSON.stringify(manifest, null, 2),
    ...additionalFiles
  };
  
  return createTestProject(name, files);
}

/**
 * Creates a test project with rule files.
 * 
 * @param name Project name
 * @param rules Record of rule file paths to content
 * @returns Path to the created project
 */
export async function createProjectWithRules(
  name: string,
  rules: Record<string, string>
): Promise<string> {
  return createTestProject(name, rules);
}

/**
 * Creates a test project with a manifest and rule files.
 * 
 * @param name Project name
 * @param manifest Manifest object
 * @param rules Rule files to create
 * @param additionalFiles Any other files to create
 * @returns Path to the created project
 */
export async function createProjectWithManifestAndRules(
  name: string,
  manifest: Manifest,
  rules: Record<string, string>,
  additionalFiles: Record<string, FileContent> = {}
): Promise<string> {
  const files: Record<string, FileContent> = {
    ".kilocode/manifest.json": JSON.stringify(manifest, null, 2),
    ...rules,
    ...additionalFiles
  };
  
  return createTestProject(name, files);
}

/**
 * Common manifest templates for testing
 */
export const MANIFEST_TEMPLATES = {
  ansible: {
    rules: {
      ".kilocode/ansible.md": {
        condition: "**/*.yml"
      }
    }
  },
  terraform: {
    rules: {
      ".kilocode/terraform.md": {
        condition: "**/*.tf"
      }
    }
  },
  python: {
    rules: {
      ".kilocode/python.md": {
        condition: "**/*.py"
      }
    }
  },
  web: {
    rules: {
      ".kilocode/web.md": {
        condition: "**/*.{js,ts,jsx,tsx,html,css}"
      }
    }
  },
  multiRule: {
    rules: {
      ".kilocode/ansible.md": {
        condition: "**/*.yml"
      },
      ".kilocode/terraform.md": {
        condition: "**/*.tf"
      },
      ".kilocode/python.md": {
        condition: "**/*.py"
      }
    }
  },
  complexConditions: {
    rules: {
      ".kilocode/backend.md": {
        condition: "src/api/**/*.{js,ts}"
      },
      ".kilocode/frontend.md": {
        condition: "src/ui/**/*.{jsx,tsx}"
      },
      ".kilocode/config.md": {
        condition: "{package.json,tsconfig.json,.eslintrc.*}"
      }
    }
  }
} as const;

/**
 * Common rule content templates for testing
 */
export const RULE_TEMPLATES = {
  ansible: "# Ansible Rules\n\n- Use descriptive task names\n- Always use YAML syntax",
  terraform: "# Terraform Rules\n\n- Use consistent naming\n- Pin provider versions",
  python: "# Python Rules\n\n- Follow PEP 8\n- Use type hints",
  web: "# Web Development Rules\n\n- Use semantic HTML\n- Follow accessibility guidelines",
  typescript: "# TypeScript Rules\n\n- Prefer interfaces over types\n- Use strict mode"
} as const;

/**
 * Creates a multi-project test scenario with consistent manifests
 */
export async function createMultiProjectScenario(
  projectConfigs: Array<{
    name: string;
    manifest?: Manifest;
    rules?: Record<string, string>;
    files?: Record<string, FileContent>;
  }>
): Promise<string[]> {
  const projects: string[] = [];
  
  for (const config of projectConfigs) {
    if (config.manifest) {
      projects.push(
        await createProjectWithManifestAndRules(
          config.name,
          config.manifest,
          config.rules || {},
          config.files || {}
        )
      );
    } else {
      projects.push(
        await createProjectWithRules(
          config.name,
          { ...config.rules, ...config.files } || {}
        )
      );
    }
  }
  
  return projects;
}

/**
 * Common test scenarios for manifest synchronization
 */
export const SYNC_SCENARIOS = {
  // Scenario: Projects with matching manifests
  matchingManifests: [
    {
      name: "project-a",
      manifest: MANIFEST_TEMPLATES.ansible,
      rules: { ".kilocode/ansible.md": RULE_TEMPLATES.ansible },
      files: { "playbook.yml": "---\n- hosts: all" }
    },
    {
      name: "project-b", 
      manifest: MANIFEST_TEMPLATES.ansible,
      rules: { ".kilocode/ansible.md": RULE_TEMPLATES.ansible },
      files: { "inventory.yml": "---\nall:" }
    }
  ],
  
  // Scenario: Projects with different manifests
  differentManifests: [
    {
      name: "project-a",
      manifest: MANIFEST_TEMPLATES.ansible,
      rules: { ".kilocode/ansible.md": RULE_TEMPLATES.ansible },
      files: { "playbook.yml": "---\n- hosts: all" }
    },
    {
      name: "project-b",
      manifest: MANIFEST_TEMPLATES.terraform,
      rules: { ".kilocode/terraform.md": RULE_TEMPLATES.terraform },
      files: { "main.tf": "provider \"aws\" {}" }
    }
  ],
  
  // Scenario: Mixed projects (with and without manifests)
  mixedProjects: [
    {
      name: "project-a",
      manifest: MANIFEST_TEMPLATES.python,
      rules: { ".kilocode/python.md": RULE_TEMPLATES.python },
      files: { "main.py": "print('Hello')" }
    },
    {
      name: "project-b",
      rules: { ".cursorrules.md": "# Basic Rules" }
    },
    {
      name: "project-c",
      manifest: MANIFEST_TEMPLATES.python,
      rules: { ".kilocode/python.md": RULE_TEMPLATES.python },
      files: { "app.py": "def main(): pass" }
    }
  ]
} as const;