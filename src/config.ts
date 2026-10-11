import { cosmiconfig } from 'cosmiconfig';
import { z } from 'zod';
import type { LognotConfig, SectionDef } from './types.js';
import { DEFAULT_SECTIONS, DEFAULT_IGNORE_TYPES } from './group.js';

const sectionSchema = z.object({
  title: z.string().min(1, 'Section title must not be empty'),
  emoji: z.string().default(''),
});

const githubSchema = z.object({
  owner: z.string().optional(),
  repo: z.string().optional(),
  draft: z.boolean().default(false),
  prerelease: z.boolean().default(false),
});

const packageSchema = z.object({
  path: z.string().min(1, 'Package path is required'),
  output: z.string().min(1, 'Package output path is required'),
});

export const configSchema = z.object({
  output: z.string().default('CHANGELOG.md'),
  format: z.enum(['keepachangelog', 'release']).default('keepachangelog'),
  tagPrefix: z.string().default('v'),
  bump: z.enum(['auto', 'major', 'minor', 'patch']).default('auto'),
  ignoreTypes: z.array(z.string()).default(DEFAULT_IGNORE_TYPES),
  includeMergeCommits: z.boolean().default(false),
  sections: z.record(sectionSchema).default(DEFAULT_SECTIONS),
  repoUrl: z.string().optional(),
  github: githubSchema.optional(),
  packages: z.record(packageSchema).optional(),
});

export const DEFAULT_CONFIG: LognotConfig = {
  output: 'CHANGELOG.md',
  format: 'keepachangelog',
  tagPrefix: 'v',
  bump: 'auto',
  ignoreTypes: [...DEFAULT_IGNORE_TYPES],
  includeMergeCommits: false,
  sections: { ...DEFAULT_SECTIONS },
};

/**
 * Formats Zod validation issues into clear, human-readable error messages showing the key path.
 */
export function formatZodError(error: z.ZodError): string {
  const messages = error.issues.map((issue) => {
    const keyPath = issue.path.join('.') || 'root';
    return `  - ${keyPath}: ${issue.message}`;
  });
  return `Invalid configuration:\n${messages.join('\n')}`;
}

/**
 * Validates and normalizes user configuration.
 * @param rawConfig Raw configuration object
 */
export function validateConfig(rawConfig: unknown): LognotConfig {
  const result = configSchema.safeParse(rawConfig ?? {});
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }
  return result.data as LognotConfig;
}

/**
 * Merges loaded config with defaults, ensuring deep merge of sections.
 */
export function mergeConfig(rawUserConfig?: Partial<LognotConfig>): LognotConfig {
  const userSections: Record<string, SectionDef> = rawUserConfig?.sections
    ? { ...DEFAULT_SECTIONS, ...rawUserConfig.sections }
    : { ...DEFAULT_SECTIONS };

  const merged = {
    ...DEFAULT_CONFIG,
    ...rawUserConfig,
    sections: userSections,
  };

  return validateConfig(merged);
}

/**
 * Loads and validates configuration using cosmiconfig.
 * Looks for lognot.config.json, .lognotrc, package.json "lognot", etc.
 *
 * @param cwd Working directory
 * @param configPath Explicit config file path if specified
 */
export async function loadConfig(
  cwd: string = process.cwd(),
  configPath?: string,
): Promise<{ config: LognotConfig; filepath?: string }> {
  const explorer = cosmiconfig('lognot', {
    searchPlaces: [
      'package.json',
      '.lognotrc',
      '.lognotrc.json',
      '.lognotrc.yaml',
      '.lognotrc.yml',
      '.lognotrc.js',
      '.lognotrc.cjs',
      '.lognotrc.mjs',
      'lognot.config.json',
      'lognot.config.js',
      'lognot.config.cjs',
      'lognot.config.mjs',
    ],
    stopDir: cwd,
  });

  let loaded: { config: unknown; filepath: string } | null = null;

  if (configPath) {
    loaded = await explorer.load(configPath);
  } else {
    loaded = await explorer.search(cwd);
  }

  if (!loaded || !loaded.config) {
    return { config: DEFAULT_CONFIG };
  }

  const merged = mergeConfig(loaded.config as Partial<LognotConfig>);
  return {
    config: merged,
    filepath: loaded.filepath,
  };
}
