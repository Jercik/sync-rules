import { beforeEach, afterEach } from "vitest";
import * as tmp from "tmp";
import * as fs from "fs/promises";
import * as path from "path";

interface TestContext {
  tempDir: string;
  cleanup: () => void;
}

export const testContext: TestContext = {
  tempDir: "",
  cleanup: () => {},
};

beforeEach(async () => {
  const tmpObj = tmp.dirSync({ unsafeCleanup: true });
  testContext.tempDir = tmpObj.name;
  testContext.cleanup = tmpObj.removeCallback;

  process.env.SYNC_RULES_TEST = "true";
  process.env.NO_COLOR = "1";
});

afterEach(async () => {
  testContext.cleanup();
  delete process.env.SYNC_RULES_TEST;
  delete process.env.NO_COLOR;
});

export type FileContent = string | { content: string; mtime?: Date };

export async function createTestProject(
  name: string,
  files: Record<string, FileContent>,
): Promise<string> {
  const projectPath = path.join(testContext.tempDir, name);
  await fs.mkdir(projectPath, { recursive: true });

  for (const [filePath, fileData] of Object.entries(files)) {
    const fullPath = path.join(projectPath, filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    if (typeof fileData === "string") {
      await fs.writeFile(fullPath, fileData, "utf8");
    } else {
      await fs.writeFile(fullPath, fileData.content, "utf8");
      if (fileData.mtime) {
        await fs.utimes(fullPath, fileData.mtime, fileData.mtime);
      }
    }
  }

  return projectPath;
}

export async function readTestFile(
  projectPath: string,
  filePath: string,
): Promise<string> {
  return fs.readFile(path.join(projectPath, filePath), "utf8");
}

export async function fileExists(
  projectPath: string,
  filePath: string,
): Promise<boolean> {
  try {
    await fs.access(path.join(projectPath, filePath));
    return true;
  } catch {
    return false;
  }
}
