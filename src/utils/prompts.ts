import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

/**
 * Prompts the user for a yes/no confirmation.
 * @param question The question to ask the user
 * @returns Promise<boolean> true if user confirms, false otherwise
 */
export async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`${question} (y/N): `);
    return (
      answer.toLowerCase().trim() === "y" ||
      answer.toLowerCase().trim() === "yes"
    );
  } finally {
    rl.close();
  }
}

/**
 * Prompts the user to select from a list of options.
 * @param question The question to ask
 * @param options Array of option objects with label and value
 * @returns Promise<string> the selected option value
 */
export async function select<T extends string>(
  question: string,
  options: Array<{ label: string; value: T }>,
): Promise<T> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    console.log(`\n${question}`);
    options.forEach((option, index) => {
      console.log(`  ${index + 1}. ${option.label}`);
    });

    while (true) {
      const answer = await rl.question(
        `\nSelect an option (1-${options.length}): `,
      );
      const choice = parseInt(answer.trim(), 10);

      if (choice >= 1 && choice <= options.length) {
        return options[choice - 1]!.value;
      }

      console.log(
        `Invalid choice. Please enter a number between 1 and ${options.length}.`,
      );
    }
  } finally {
    rl.close();
  }
}
