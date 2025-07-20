import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { normalizePath, logMessage } from "./utils.ts";
import type { FSAction } from "./utils.ts";

export interface ExecutionReport {
  success: boolean;
  changes: {
    written: string[];
    copied: string[];
    createdDirs: string[];
  };
  errors: Error[];
}

export async function safeMkdir(
  path: string,
  recursive = true,
  verbose = false,
): Promise<void> {
  // Path already normalized in executeActions
  logMessage(`Creating dir: ${path} (recursive: ${recursive})`, verbose);
  try {
    await fs.mkdir(path, { recursive });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }
}

export async function simpleWrite(
  path: string,
  content: string,
  verbose = false,
): Promise<void> {
  // Path already normalized in executeActions
  logMessage(`Writing to: ${path}`, verbose);
  await fs.writeFile(path, content, "utf8");
}

export async function safeCopy(
  from: string,
  to: string,
  verbose = false,
): Promise<void> {
  // Paths already normalized in executeActions
  logMessage(`Copying ${from} to ${to}`, verbose);
  await fs.cp(from, to, { recursive: true, force: true });
}

export function previewAction(action: FSAction): string {
  switch (action.type) {
    case "write":
      return `[Write] ${action.path}`;
    case "mkdir":
      return `[Mkdir] ${action.path}`;
    case "copy":
      return `[Copy] ${action.from} -> ${action.to}`;
  }
}

function normalizeActionPaths(action: FSAction): FSAction {
  switch (action.type) {
    case "write":
      return { ...action, path: normalizePath(action.path) };
    case "mkdir":
      return { ...action, path: normalizePath(action.path) };
    case "copy":
      return {
        ...action,
        from: normalizePath(action.from),
        to: normalizePath(action.to),
      };
  }
}

export async function executeActions(
  actions: FSAction[],
  opts: { dryRun?: boolean; verbose?: boolean } = {},
): Promise<ExecutionReport> {
  const { dryRun = false, verbose = false } = opts;
  const report: ExecutionReport = {
    success: true,
    changes: {
      written: [],
      copied: [],
      createdDirs: [],
    },
    errors: [],
  };

  if (actions.length === 0) {
    return report;
  }

  // Normalize all paths upfront to ensure uniformity
  const normalizedActions = actions.map(normalizeActionPaths);

  // Step 1: Check dependencies (parent directories must exist)
  if (!dryRun) {
    for (const action of normalizedActions) {
      if (action.type !== "mkdir") {
        const targetPath = action.type === "copy" ? action.to : action.path;
        const parent = dirname(targetPath);

        try {
          await fs.stat(parent);
        } catch {
          // Check if parent will be created by a mkdir action
          const parentWillBeCreated = normalizedActions.some(
            (a) => a.type === "mkdir" && a.path === parent,
          );

          if (!parentWillBeCreated) {
            throw new Error(`Missing parent directory for ${targetPath}`);
          }
        }
      }
    }
  }

  // Step 2: Group actions by target path
  const groups = new Map<string, FSAction[]>();

  for (const action of normalizedActions) {
    let groupKey: string;

    switch (action.type) {
      case "write":
        // Group writes by their parent directory
        groupKey = dirname(action.path);
        break;
      case "mkdir":
        // Group mkdir by the directory itself to ensure parent dirs are created first
        groupKey = action.path;
        break;
      case "copy":
        // Group copies by their destination parent directory
        groupKey = dirname(action.to);
        break;
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(action);
  }

  // Step 3: Sort groups lexicographically
  const sortedGroupKeys = Array.from(groups.keys()).sort();

  // Step 4: Define action type priority for sorting
  const actionPriority = (action: FSAction): number => {
    switch (action.type) {
      case "mkdir":
        return 0;
      case "copy":
        return 1;
      case "write":
        return 2;
    }
  };

  // Step 5: Execute actions
  const executeAction = async (action: FSAction): Promise<void> => {
    // Preview the action
    if (dryRun) {
      const preview = previewAction(action);
      logMessage(`[Dry-run] ${preview}`, verbose);
    }

    // Execute or skip based on dry-run mode
    switch (action.type) {
      case "mkdir":
        if (!dryRun) {
          await safeMkdir(action.path, true, verbose);
        }
        report.changes.createdDirs.push(action.path);
        break;
      case "write":
        if (!dryRun) {
          await simpleWrite(action.path, action.content, verbose);
        }
        report.changes.written.push(action.path);
        break;
      case "copy":
        if (!dryRun) {
          await safeCopy(action.from, action.to, verbose);
        }
        report.changes.copied.push(action.to);
        break;
    }
  };

  // Process groups sequentially, throwing on first error
  for (const groupKey of sortedGroupKeys) {
    const groupActions = groups.get(groupKey)!;
    const sortedActions = groupActions.sort(
      (a, b) => actionPriority(a) - actionPriority(b),
    );

    try {
      for (const action of sortedActions) {
        await executeAction(action);
      }
    } catch (err) {
      if (!dryRun) {
        report.errors.push(err as Error);
        report.success = false;
        throw err; // Always fail fast
      }
    }
  }

  return report;
}
