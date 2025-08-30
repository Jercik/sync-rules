import prompts from "prompts";

/**
 * Checks if stdin is a TTY (interactive terminal).
 * Returns false in non-interactive environments like CI/CD.
 */
export function isInteractive(): boolean {
  return process.stdin.isTTY === true;
}

/**
 * Prompts the user with a yes/no question
 * @param question - The question to ask the user
 * @returns true if user answered yes, false otherwise
 */
export async function promptYesNo(
  question = "Proceed? [Y/n]",
): Promise<boolean> {
  // In non-TTY environments, skip prompts and return false
  if (!isInteractive()) {
    return false;
  }

  const response = await prompts({
    type: "confirm",
    name: "value",
    message: question,
    initial: true,
  });

  return response.value ?? false;
}
