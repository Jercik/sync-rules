#!/usr/bin/env node

import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };

export async function main(argv: string[]) {
  const program = new Command();
  const version = packageJson.version || "unknown";

  program
    .name("sync-rules")
    .version(version, "-v, --version", "Output the current version")
    .description("A simple CLI to greet the world");

  program
    .command("hello-world")
    .description("A simple command to print hello world")
    .action(() => {
      console.log("hello world");
    });

  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Unexpected error: ${error.message}`);
    } else {
      console.error("An unexpected error occurred during command parsing.");
    }
    process.exit(1);
  }
}
