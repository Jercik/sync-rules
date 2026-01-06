import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

// Root directory for test temp files; allows override for debugging
function testTemporaryRoot(): string {
  return process.env.TEST_TMPDIR || tmpdir();
}

export async function makeTemporaryDirectory(
  prefix = "sync-rules-test-",
): Promise<string> {
  const root = testTemporaryRoot();
  return mkdtemp(path.join(root, prefix));
}

// Cleanup helper (ignore errors by using force: true)
export async function cleanupDirectory(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
}
