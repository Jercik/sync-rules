export interface PatternWarning {
  source: string;
  patterns: string[];
}

const GLOBAL_OVERRIDE_PATTERN = /^globalOverrides\.(?<harness>[^:]+): (?<pattern>.+)$/u;

function addPatternWarning(warnings: PatternWarning[], source: string, pattern: string): void {
  const existing = warnings.find((warning) => warning.source === source);
  if (existing) {
    existing.patterns.push(pattern);
    return;
  }
  warnings.push({ source, patterns: [pattern] });
}

/**
 * Convert raw unmatched patterns from syncGlobal into structured warnings.
 *
 * Patterns prefixed with `globalOverrides.<harness>:` are grouped under
 * the corresponding override source; everything else is grouped under
 * `"global"`.
 */
export function collectGlobalPatternWarnings(unmatchedPatterns: string[]): PatternWarning[] {
  const warnings: PatternWarning[] = [];
  for (const pattern of unmatchedPatterns) {
    const match = GLOBAL_OVERRIDE_PATTERN.exec(pattern);
    const harness = match?.groups?.harness;
    const overridePattern = match?.groups?.pattern;
    if (harness && overridePattern) {
      addPatternWarning(warnings, `globalOverrides.${harness}`, overridePattern);
      continue;
    }
    addPatternWarning(warnings, "global", pattern);
  }
  return warnings;
}
