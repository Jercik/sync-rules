import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { adapterRegistry } from "../adapters/registry.ts";
import open from "open";
import { globby } from "globby";
import { normalizePath } from "../utils/paths.ts";
import { normalizeContent } from "../utils/content.ts";
import type { WriteAction } from "../utils/content.ts";
import { loadRulesFromCentral } from "./rules-fs.ts";
import { CENTRAL_RULES_DIR } from "../config/constants.ts";
import type { AdapterName } from "../config/config.ts";
import { EditorOpenError, ensureError } from "../utils/errors.ts";

export interface VerificationIssue {
  type: "missing" | "modified" | "extra";
  path: string;
}

export interface VerificationResult {
  synced: boolean;
  issues: VerificationIssue[];
}

// Path comparisons are uniformly case-sensitive across all platforms.
// Use absolute paths from `normalizePath` for consistent comparison.

/**
 * Verifies that on-disk rule files for a given adapter and project match the
 * expected contents generated from the central rules repository.
 *
 * It compares file contents with normalized line endings and trailing whitespace
 * trimming, and for multi-file adapters also reports unexpected extra files.
 *
 * @param projectPath - Absolute path to the target project.
 * @param adapterName - The adapter to verify against (e.g., `claude`).
 * @param rulePatterns - Glob patterns selecting rules from the central repo.
 * @returns A verification result with `synced` state and a list of issues.
 */
export async function verifyRules(
  projectPath: string,
  adapterName: AdapterName,
  rulePatterns: string[],
): Promise<VerificationResult> {
  // Get adapter definition and generate expected actions
  const adapterDef = adapterRegistry[adapterName];
  if (!adapterDef) {
    throw new Error(`Unknown adapter: ${adapterName}`);
  }
  const rules = await loadRulesFromCentral(CENTRAL_RULES_DIR, rulePatterns);
  const expectedActions = adapterDef.planWrites({ projectPath, rules });

  const issues: VerificationIssue[] = [];

  // Compare each expected action with filesystem using normalized comparison
  for (const action of expectedActions) {
    try {
      const actual = await readFile(action.path, "utf8");
      // Normalize both texts to handle OS/editor differences
      const normalizedActual = normalizeContent(actual);
      const normalizedExpected = normalizeContent(action.content);

      if (normalizedActual !== normalizedExpected) {
        issues.push({ type: "modified", path: action.path });
      }
    } catch {
      issues.push({ type: "missing", path: action.path });
    }
  }

  // For multi-file adapters, check for extra files
  if (adapterDef.meta.type === "multi-file") {
    const rulesDir = join(projectPath, adapterDef.meta.directory);

    // Normalize expected paths for comparison
    // All paths are absolute thanks to normalizePath in actions and findAllFiles
    const expectedPaths = new Set(
      expectedActions.map((a: WriteAction) =>
        normalizePath(a.path).replace(/\/$/, ""),
      ),
    );

    let actualFiles: string[] = [];
    try {
      const files = await globby("**/*", { cwd: rulesDir, absolute: true });
      actualFiles = files.map(normalizePath);
    } catch {
      // Directory doesn't exist - continue with empty array
    }

    for (const file of actualFiles) {
      // file is already absolute and normalized
      const normalizedFile = normalizePath(file).replace(/\/$/, "");
      if (!expectedPaths.has(normalizedFile)) {
        issues.push({ type: "extra", path: file });
      }
    }
  }

  return { synced: issues.length === 0, issues };
}

/**
 * Opens the given config file in the default editor.
 * Uses the 'open' library for cross-platform support.
 * Exits the process after launching.
 *
 * @param configPath - Path to the config file to open.
 */
export async function openConfigForEditing(
  configPath: string,
): Promise<boolean> {
  try {
    await open(configPath, { wait: false });
    return true;
  } catch (error) {
    throw new EditorOpenError(configPath, ensureError(error));
  }
}
