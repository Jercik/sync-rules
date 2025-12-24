import type { Command } from "@commander-js/extra-typings";

type ParentCommand = Command<[], { config: string; verbose?: true }>;

export function registerConfigPathCommand(program: ParentCommand): void {
  program
    .command("config-path")
    .description("Print the resolved configuration file path")
    .addHelpText(
      "after",
      `
Prints the path to the configuration file that would be used.
Useful for scripting and debugging configuration issues.

Examples:
  sync-rules config-path                      # Print default config path
  sync-rules --config ./my.json config-path   # Print custom config path
  cat "$(sync-rules config-path)"             # View config contents`,
    )
    .action(() => {
      const parentOpts = program.opts();
      console.log(parentOpts.config);
    });
}
