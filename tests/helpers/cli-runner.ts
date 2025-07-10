import { spawn } from "child_process";
import * as path from "path";

export interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CLIOptions {
  cwd?: string;
  env?: Record<string, string>;
  input?: string;
  timeout?: number;
}

export async function runCLI(
  args: string[],
  options: CLIOptions = {},
): Promise<CLIResult> {
  const cliPath = path.join(process.cwd(), "bin", "sync-rules.ts");

  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      ...options.env,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    };

    const child = spawn("node", [cliPath, ...args], {
      cwd: options.cwd || process.cwd(),
      env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    if (options.input) {
      child.stdin.write(options.input);
      child.stdin.end();
    }

    const timeoutId = options.timeout
      ? setTimeout(() => {
          child.kill();
          reject(new Error("CLI command timed out"));
        }, options.timeout)
      : null;

    child.on("close", (code) => {
      if (timeoutId) clearTimeout(timeoutId);

      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });

    child.on("error", (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(err);
    });
  });
}

export async function runCLIWithInput(
  args: string[],
  inputs: string[],
  options: CLIOptions = {},
): Promise<CLIResult> {
  const input = inputs.join("\n") + "\n";
  return runCLI(args, { ...options, input });
}

export function expectSuccess(result: CLIResult): void {
  if (result.exitCode !== 0) {
    throw new Error(
      `CLI exited with code ${result.exitCode}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }
}

export function expectFailure(result: CLIResult): void {
  if (result.exitCode === 0) {
    throw new Error(
      `Expected CLI to fail but it succeeded\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
    );
  }
}

export function extractOutput(result: CLIResult): string {
  return result.stdout.trim();
}

export function extractError(result: CLIResult): string {
  return result.stderr.trim();
}

export function containsInOutput(result: CLIResult, text: string): boolean {
  const lowerText = text.toLowerCase();
  return (
    result.stdout.toLowerCase().includes(lowerText) ||
    result.stderr.toLowerCase().includes(lowerText)
  );
}
