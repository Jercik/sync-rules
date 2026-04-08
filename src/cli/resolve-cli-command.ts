import { normalizePath } from "../utils/paths.js";

export type RawCliInput = {
  config: string;
  verbose?: boolean;
  dryRun?: boolean;
  porcelain?: boolean;
  json?: boolean;
  init?: boolean;
  force?: boolean;
  paths?: boolean;
};

type CliCommandInput = {
  configPath: string;
  verbose?: boolean;
  dryRun?: boolean;
  porcelain?: boolean;
  json?: boolean;
  init?: boolean;
  force?: boolean;
  paths?: boolean;
};

type CliCommand =
  | {
      kind: "init";
      configPath: string;
      force: boolean;
    }
  | {
      kind: "paths";
      configPath: string;
    }
  | {
      kind: "sync";
      options: {
        configPath: string;
        verbose: boolean;
        dryRun: boolean;
        porcelain: boolean;
        json: boolean;
      };
    };

function normalizeCliInput(rawInput: RawCliInput): CliCommandInput {
  return {
    configPath: normalizePath(rawInput.config),
    verbose: rawInput.verbose,
    dryRun: rawInput.dryRun,
    porcelain: rawInput.porcelain,
    json: rawInput.json,
    init: rawInput.init,
    force: rawInput.force,
    paths: rawInput.paths,
  };
}

function resolveCommand(input: CliCommandInput): CliCommand {
  const wantsInit = input.init ?? false;
  const wantsPaths = input.paths ?? false;
  const wantsDryRun = input.dryRun ?? false;
  const wantsPorcelain = input.porcelain ?? false;
  const wantsJson = input.json ?? false;
  const wantsForce = input.force ?? false;
  const wantsSyncFlags = wantsDryRun || wantsPorcelain || wantsJson;

  if (wantsForce && !wantsInit) {
    throw new Error("--force can only be used with --init");
  }
  if (wantsInit && wantsPaths) {
    throw new Error("Use only one of --init or --paths");
  }
  if ((wantsInit || wantsPaths) && wantsSyncFlags) {
    throw new Error("--dry-run, --porcelain, and --json apply only to sync");
  }
  if (wantsPorcelain && wantsJson) {
    throw new Error("--porcelain and --json are mutually exclusive");
  }

  if (wantsInit) {
    return { kind: "init", configPath: input.configPath, force: wantsForce };
  }
  if (wantsPaths) {
    return { kind: "paths", configPath: input.configPath };
  }
  return {
    kind: "sync",
    options: {
      configPath: input.configPath,
      verbose: input.verbose ?? false,
      dryRun: wantsDryRun || wantsPorcelain || wantsJson,
      porcelain: wantsPorcelain,
      json: wantsJson,
    },
  };
}

export function resolveCliCommand(rawInput: RawCliInput): CliCommand {
  return resolveCommand(normalizeCliInput(rawInput));
}
