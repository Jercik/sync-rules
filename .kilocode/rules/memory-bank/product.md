# Product: sync-rules

## Purpose and Problems Solved

sync-rules exists to address the pain of maintaining consistent AI coding rules across multiple projects. Developers often use AI assistants like Claude, Gemini, or Kilocode, which require custom rule files for styles, best practices, and configurations. Manually copying and updating these rules leads to inconsistencies, errors, and wasted time. sync-rules provides a centralized, automated, one-way propagation tool that ensures rules stay aligned from a single source of truth, reducing manual effort while emphasizing safety (e.g., no automatic syncing without explicit config) and control.

## High-Level User Stories

- As a developer managing multiple repos, I want to define rules once in a central repo and propagate them easily, so I avoid duplication.
- As a team lead, I want config-based selection of rules and adapters per project, so tailoring is deliberate and auditable.
- As a user concerned with security, I want path validation and file filters, so the tool can't be exploited or overwrite unintended files.
- As a tester, I want 100% coverage and dry-run previews, so changes are verifiable without risk.

## Functional Requirements and Behaviors

- Read user config (~/.config/sync-rules/config.json) validated by Zod.
- Glob and filter rules from central repo (~/Developer/agent-rules/rules).
- Apply adapters (claude: concat to CLAUDE.md; gemini: concat to GEMINI.md; kilocode: copy to .kilocode/rules/).
- Support flags: --dry-run (preview), --verbose (logs).
- Parallel processing of projects, atomic file operations.
- Error handling: Skip invalid files, informative messages for issues.
- Non-interactive, overwrite generated files (central is truth).

## Non-Technical Success Criteria

- Usability: Single command execution <5s for typical use (small rules).
- Reliability: 100% test coverage, no crashes on edge cases (e.g., missing repo).
- Maintainability: Modular adapters for easy extension.
- Performance: Handle up to 100 rules/projects without noticeable delay.
