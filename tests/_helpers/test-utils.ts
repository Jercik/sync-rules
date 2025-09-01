import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Root directory for test temp files; allows override for debugging
export function testTmpRoot(): string {
  return process.env.TEST_TMPDIR || tmpdir();
}

export async function makeTempDir(
  prefix = "sync-rules-test-",
): Promise<string> {
  const root = testTmpRoot();
  return mkdtemp(join(root, prefix));
}

// Cleanup helper (ignore errors by using force: true)
export async function cleanupDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}
