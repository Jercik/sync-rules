import { z } from 'zod';

/**
 * Schema for rule condition in manifest
 */
const RuleConditionSchema = z.object({
  condition: z.string().min(1, "Condition must be a non-empty string")
});

/**
 * Schema for manifest file (.kilocode/manifest.json)
 */
export const ManifestSchema = z.object({
  rules: z.record(z.string(), RuleConditionSchema)
});

/**
 * Schema for local manifest file (.kilocode/manifest.local.json)
 */
export const LocalManifestSchema = z.object({
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional()
});

// Type exports
export type Manifest = z.infer<typeof ManifestSchema>;
export type LocalManifest = z.infer<typeof LocalManifestSchema>;
export type RuleCondition = z.infer<typeof RuleConditionSchema>;