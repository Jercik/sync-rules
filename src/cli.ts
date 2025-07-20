import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
// TODO: Phase 6 - Full CLI integration with adapters
// import { getAdapter } from "./adapters/index.ts";

export async function main(argv: string[]) {
  const program = new Command();

  program
    .name(packageJson.name)
    .description(packageJson.description)
    .version(
      packageJson.version,
      "-v, --version",
      "Output the current version",
    );

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
