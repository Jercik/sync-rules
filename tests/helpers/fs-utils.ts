import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

export async function createFile(
  filePath: string,
  content: string | Buffer,
  options?: { mode?: number; mtime?: Date },
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);

  if (options?.mode) {
    await fs.chmod(filePath, options.mode);
  }

  if (options?.mtime) {
    await fs.utimes(filePath, options.mtime, options.mtime);
  }
}

export async function createBinaryFile(
  filePath: string,
  size: number,
): Promise<void> {
  const buffer = Buffer.alloc(size);
  crypto.randomFillSync(buffer);
  await createFile(filePath, buffer);
}

export async function createLargeFile(
  filePath: string,
  sizeMB: number,
): Promise<void> {
  const chunkSize = 1024 * 1024; // 1MB chunks
  const totalChunks = sizeMB;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const writeStream = (await import("fs")).createWriteStream(filePath);

  for (let i = 0; i < totalChunks; i++) {
    const chunk = Buffer.alloc(chunkSize, "x");
    writeStream.write(chunk);
  }

  return new Promise((resolve, reject) => {
    writeStream.end((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export async function setFileTime(filePath: string, time: Date): Promise<void> {
  await fs.utimes(filePath, time, time);
}

export async function createSymlink(
  target: string,
  linkPath: string,
): Promise<void> {
  await fs.mkdir(path.dirname(linkPath), { recursive: true });
  await fs.symlink(target, linkPath);
}

export async function createDirectoryStructure(
  basePath: string,
  structure: Record<string, string | null>,
): Promise<void> {
  for (const [relativePath, content] of Object.entries(structure)) {
    const fullPath = path.join(basePath, relativePath);

    if (content === null) {
      await fs.mkdir(fullPath, { recursive: true });
    } else {
      await createFile(fullPath, content);
    }
  }
}

export async function getAllFiles(dirPath: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        files.push(path.relative(dirPath, fullPath));
      }
    }
  }

  await walk(dirPath);
  return files.sort();
}

export async function compareFiles(
  file1: string,
  file2: string,
): Promise<boolean> {
  try {
    const [content1, content2] = await Promise.all([
      fs.readFile(file1),
      fs.readFile(file2),
    ]);
    return content1.equals(content2);
  } catch {
    return false;
  }
}
