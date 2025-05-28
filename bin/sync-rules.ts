#!/usr/bin/env node

import { main } from "../src/cli.ts";

async function run() {
  try {
    await main(process.argv);
    // main() already calls process.exit with proper codes (0, 1, 2)
    // If we reach here, it means main() didn't exit, which shouldn't happen
  } catch (error) {
    // Only catch truly unexpected errors that main() didn't handle
    if (error instanceof Error) {
      console.error(`Unexpected error: ${error.message}`);
    } else {
      console.error("An unexpected error occurred");
    }
    process.exit(2); // Use exit code 2 for unexpected errors
  }
}

run();
