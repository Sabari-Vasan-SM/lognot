import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import semver from 'semver';

import { loadConfig, DEFAULT_CONFIG } from './config.js';
import {
  isGitRepo,
  isShallowRepo,
  getRemoteRepoUrl,
  getLatestSemverTag,
  getCommits,
  getTags,
} from './git.js';
import { parseCommits, validateConventionalHeader } from './parse.js';
import { groupCommits } from './group.js';
import { calculateNextVersion } from './version.js';
import { renderChangelog } from './render.js';
import { writeChangelog } from './writer.js';
import { createOrUpdateRelease } from './github.js';
import type { LognotConfig } from './types.js';

export const EXIT_SUCCESS = 0;
export const EXIT_VALIDATION_ERROR = 1;
export const EXIT_GIT_ERROR = 2;
export const EXIT_GITHUB_ERROR = 3;
export const EXIT_UNEXPECTED_ERROR = 4;

interface GlobalOptions {
  cwd?: string;
  verbose?: boolean;
  color?: boolean;
  json?: boolean;
}

interface GenerateCommandOptions extends GlobalOptions {
  dryRun?: boolean;
  from?: string;
  to?: string;
  version?: string;
  bump?: 'auto' | 'major' | 'minor' | 'patch';
  out?: string;
  format?: 'keepachangelog' | 'release';
  stdout?: boolean;
  package?: string;
  force?: boolean;
}

interface ReleaseCommandOptions extends GlobalOptions {
  from?: string;
  to?: string;
  draft?: boolean;
  prerelease?: boolean;
  name?: string;
  package?: string;
}

interface CheckCommandOptions extends GlobalOptions {
  from?: string;
  to?: string;
  package?: string;
}

interface InitCommandOptions extends GlobalOptions {
  force?: boolean;
}

export class CliError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }
}

/**
 * Handles CLI logging and spinner management.
 */
function createLogger(options: GlobalOptions) {
  const isJson = Boolean(options.json);
  const isVerbose = Boolean(options.verbose);

  return {
    log(message: string) {
      if (!isJson) {
        console.log(message);
      }
    },
    error(message: string) {
      if (isJson) {
        console.error(JSON.stringify({ error: message }));
      } else {
        console.error(chalk.red(message));
      }
    },
    info(message: string) {
      if (!isJson) {
        console.log(chalk.cyan(message));
      }
    },
    success(message: string) {
      if (!isJson) {
        console.log(chalk.green(message));
      }
    },
    warn(message: string) {
      if (!isJson) {
        console.warn(chalk.yellow(message));
      }
    },
    verbose(message: string) {
      if (!isJson && isVerbose) {
        console.log(chalk.dim(`[verbose] ${message}`));
      }
    },
    json(data: unknown) {
      if (isJson) {
        console.log(JSON.stringify(data, null, 2));
      }
    },
    spinner(text: string) {
      if (isJson) {
        return {
          start: () => {},
          stop: () => {},
          succeed: () => {},
          fail: () => {},
          text: '',
        };
      }
      return ora(text);
    },
  };
}

/**
 * Validates that current directory is a git repository.
 */
async function ensureGitRepo(cwd: string, logger: ReturnType<typeof createLogger>): Promise<void> {
  const isRepo = await isGitRepo(cwd);
  if (!isRepo) {
    throw new CliError(
      `Fatal: not a git repository (or any of the parent directories): ${cwd}`,
      EXIT_GIT_ERROR,
    );
  }

  const isShallow = await isShallowRepo(cwd);
  if (isShallow) {
    logger.warn(
      'Warning: Shallow git clone detected. Run "git fetch --unshallow" for complete history.',
    );
  }
}

/**
 * Executes the default changelog generation logic.
 */
export async function executeGenerate(opts: GenerateCommandOptions): Promise<number> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const logger = createLogger(opts);

  await ensureGitRepo(cwd, logger);

  // 1. Load config
  let config: LognotConfig;
  try {
    const loaded = await loadConfig(cwd);
    config = loaded.config;
    if (loaded.filepath) {
      logger.verbose(`Loaded config from ${loaded.filepath}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CliError(msg, EXIT_VALIDATION_ERROR);
  }

  // 2. Resolve package in monorepo if specified
  let packagePath: string | undefined;
  let targetOutput = opts.out ?? config.output;
  if (opts.package) {
    const pkgDef = config.packages?.[opts.package];
    if (!pkgDef) {
      throw new CliError(
        `Package "${opts.package}" not found in config.packages.`,
        EXIT_VALIDATION_ERROR,
      );
    }
    packagePath = pkgDef.path;
    targetOutput = opts.out ?? pkgDef.output;
    logger.verbose(`Scoped to package "${opts.package}" at ${packagePath}`);
  }

  // 3. Resolve repo URL
  const repoUrl = config.repoUrl || (await getRemoteRepoUrl(cwd));
  logger.verbose(`Resolved repository URL: ${repoUrl ?? 'none'}`);

  // 4. Find latest tag
  const latestTagInfo = await getLatestSemverTag(cwd, config.tagPrefix, opts.package, (w) =>
    logger.verbose(w),
  );
  logger.verbose(`Latest semver tag: ${latestTagInfo ? latestTagInfo.tag : 'none'}`);

  // 5. Determine range
  const fromRef = opts.from ?? latestTagInfo?.tag;
  const toRef = opts.to ?? 'HEAD';
  logger.verbose(`Commit range: ${fromRef ?? 'root'}..${toRef}`);

  // 6. Fetch commits
  let rawCommits;
  try {
    rawCommits = await getCommits({
      cwd,
      from: fromRef,
      to: toRef,
      packagePath,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CliError(msg, EXIT_GIT_ERROR);
  }

  if (rawCommits.length === 0) {
    const message = `No commits found in range (${fromRef ?? 'root'}..${toRef}). Nothing to release.`;
    if (opts.json) {
      logger.json({
        status: 'no_commits',
        message,
        from: fromRef ?? null,
        to: toRef,
      });
    } else {
      logger.info(message);
    }
    return EXIT_SUCCESS;
  }

  logger.verbose(`Found ${rawCommits.length} commits in range`);

  // 7. Parse commits
  const parsedCommits = parseCommits(rawCommits);

  // 8. Calculate next version
  let versionPlan;
  try {
    versionPlan = calculateNextVersion(
      latestTagInfo?.tag,
      opts.bump ?? config.bump,
      parsedCommits,
      opts.version,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CliError(msg, EXIT_VALIDATION_ERROR);
  }

  // If no release bump is needed and not forced via --version
  if (!versionPlan.bumpType && !opts.version && !versionPlan.isInitial) {
    const message = versionPlan.reason;
    if (opts.json) {
      logger.json({
        status: 'no_bump',
        version: versionPlan.version,
        reason: message,
      });
    } else {
      logger.info(message);
    }
    return EXIT_SUCCESS;
  }

  // 9. Group commits
  const grouped = groupCommits(parsedCommits, {
    sections: config.sections,
    ignoreTypes: config.ignoreTypes,
    includeMergeCommits: config.includeMergeCommits,
  });

  // 10. Render Markdown
  const todayDate = new Date().toISOString().slice(0, 10);
  const format = opts.format ?? config.format;
  const rendered = renderChangelog(grouped, {
    version: versionPlan.version,
    date: todayDate,
    previousVersion: versionPlan.previousVersion ?? undefined,
    repoUrl,
    format,
  });

  // 11. Handle dry-run or stdout output
  if (opts.dryRun || opts.stdout) {
    if (opts.json) {
      logger.json({
        version: versionPlan.version,
        previousVersion: versionPlan.previousVersion,
        bumpType: versionPlan.bumpType,
        isInitial: versionPlan.isInitial,
        markdown: rendered,
        dryRun: Boolean(opts.dryRun),
      });
    } else {
      logger.log(rendered);
    }
    return EXIT_SUCCESS;
  }

  // 12. Write to changelog file
  try {
    await writeChangelog({
      filePath: path.resolve(cwd, targetOutput),
      newEntry: rendered,
      version: versionPlan.version,
      force: Boolean(opts.force),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CliError(msg, EXIT_VALIDATION_ERROR);
  }

  if (opts.json) {
    logger.json({
      status: 'success',
      version: versionPlan.version,
      previousVersion: versionPlan.previousVersion,
      output: targetOutput,
      markdown: rendered,
    });
  } else {
    logger.success(`Successfully updated ${targetOutput} for version ${versionPlan.version}`);
  }

  return EXIT_SUCCESS;
}

/**
 * Executes the "check" command to validate commit messages in range.
 */
export async function executeCheck(opts: CheckCommandOptions): Promise<number> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const logger = createLogger(opts);

  await ensureGitRepo(cwd, logger);

  const { config } = await loadConfig(cwd);

  let packagePath: string | undefined;
  if (opts.package) {
    const pkgDef = config.packages?.[opts.package];
    if (!pkgDef) {
      throw new CliError(
        `Package "${opts.package}" not found in config.packages.`,
        EXIT_VALIDATION_ERROR,
      );
    }
    packagePath = pkgDef.path;
  }

  const latestTagInfo = await getLatestSemverTag(cwd, config.tagPrefix, opts.package, (w) =>
    logger.verbose(w),
  );

  const fromRef = opts.from ?? latestTagInfo?.tag;
  const toRef = opts.to ?? 'HEAD';

  let rawCommits;
  try {
    rawCommits = await getCommits({
      cwd,
      from: fromRef,
      to: toRef,
      packagePath,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CliError(msg, EXIT_GIT_ERROR);
  }

  if (rawCommits.length === 0) {
    logger.info(`No commits found in range (${fromRef ?? 'root'}..${toRef}).`);
    return EXIT_SUCCESS;
  }

  const allowedTypes = Object.keys(config.sections).concat(config.ignoreTypes);
  const invalidCommits: Array<{ sha: string; header: string; reason?: string }> = [];

  for (const commit of rawCommits) {
    const header = commit.raw.split(/\r?\n/)[0]?.trim() ?? '';
    const validation = validateConventionalHeader(header, allowedTypes);
    if (!validation.valid) {
      invalidCommits.push({
        sha: commit.sha.slice(0, 7),
        header,
        reason: validation.reason,
      });
    }
  }

  if (invalidCommits.length > 0) {
    if (opts.json) {
      logger.json({
        status: 'failed',
        invalidCount: invalidCommits.length,
        invalidCommits,
      });
    } else {
      logger.error(`Validation failed: ${invalidCommits.length} invalid commit(s) found:`);
      for (const item of invalidCommits) {
        logger.error(`  - [${item.sha}] "${item.header}": ${item.reason}`);
      }
    }
    return EXIT_VALIDATION_ERROR;
  }

  if (opts.json) {
    logger.json({
      status: 'passed',
      totalChecked: rawCommits.length,
    });
  } else {
    logger.success(`All ${rawCommits.length} commits in range follow Conventional Commits.`);
  }

  return EXIT_SUCCESS;
}

/**
 * Executes the "init" command to generate a lognot.config.json file.
 */
export async function executeInit(opts: InitCommandOptions): Promise<number> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const logger = createLogger(opts);
  const targetFile = path.join(cwd, 'lognot.config.json');

  try {
    await fs.access(targetFile);
    if (!opts.force) {
      throw new CliError(
        'lognot.config.json already exists. Use --force to overwrite.',
        EXIT_VALIDATION_ERROR,
      );
    }
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code !== 'ENOENT') {
      throw err;
    }
  }

  const sampleConfig: LognotConfig = {
    ...DEFAULT_CONFIG,
    repoUrl: 'https://github.com/you/repo',
    github: {
      owner: 'you',
      repo: 'repo',
      draft: false,
      prerelease: false,
    },
    packages: {
      core: {
        path: 'packages/core',
        output: 'packages/core/CHANGELOG.md',
      },
    },
  };

  await fs.writeFile(targetFile, JSON.stringify(sampleConfig, null, 2) + '\n', 'utf8');

  if (opts.json) {
    logger.json({ status: 'created', file: 'lognot.config.json' });
  } else {
    logger.success('Created lognot.config.json with default configuration.');
  }

  return EXIT_SUCCESS;
}

/**
 * Executes the "release" command to publish a GitHub release.
 */
export async function executeRelease(opts: ReleaseCommandOptions): Promise<number> {
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const logger = createLogger(opts);

  await ensureGitRepo(cwd, logger);

  const { config } = await loadConfig(cwd);
  const repoUrl = config.repoUrl || (await getRemoteRepoUrl(cwd));

  // Find latest tag
  const latestTagInfo = await getLatestSemverTag(cwd, config.tagPrefix, opts.package, (w) =>
    logger.verbose(w),
  );

  if (!latestTagInfo) {
    throw new CliError('No semver tags found in repository to release.', EXIT_GIT_ERROR);
  }

  // Find prior tag to get range of commits
  const allTags = await getTags(cwd);
  const validTags = allTags
    .map((t) => ({ tag: t, clean: semver.clean(t) || semver.valid(t) }))
    .filter((item): item is { tag: string; clean: string } => item.clean !== null)
    .sort((a, b) => semver.rcompare(a.clean, b.clean));

  const latestIndex = validTags.findIndex((t) => t.tag === latestTagInfo.tag);
  const priorTag =
    latestIndex >= 0 && latestIndex + 1 < validTags.length
      ? validTags[latestIndex + 1]?.tag
      : undefined;

  const fromRef = opts.from ?? priorTag;
  const toRef = opts.to ?? latestTagInfo.tag;

  let packagePath: string | undefined;
  if (opts.package) {
    const pkgDef = config.packages?.[opts.package];
    if (pkgDef) {
      packagePath = pkgDef.path;
    }
  }

  const rawCommits = await getCommits({
    cwd,
    from: fromRef,
    to: toRef,
    packagePath,
  });

  const parsedCommits = parseCommits(rawCommits);
  const grouped = groupCommits(parsedCommits, {
    sections: config.sections,
    ignoreTypes: config.ignoreTypes,
    includeMergeCommits: config.includeMergeCommits,
  });

  const todayDate = new Date().toISOString().slice(0, 10);
  const releaseBody = renderChangelog(grouped, {
    version: latestTagInfo.version,
    date: todayDate,
    repoUrl,
    format: 'release',
  });

  logger.verbose(`Creating/updating release for tag: ${latestTagInfo.tag}`);

  try {
    const releaseResult = await createOrUpdateRelease({
      tag: latestTagInfo.tag,
      name: opts.name ?? latestTagInfo.tag,
      body: releaseBody,
      repoUrl,
      githubConfig: config.github,
      draft: opts.draft,
      prerelease: opts.prerelease,
    });

    if (opts.json) {
      logger.json(releaseResult);
    } else {
      logger.success(`GitHub release ${releaseResult.action} successfully: ${releaseResult.url}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CliError(msg, EXIT_GITHUB_ERROR);
  }

  return EXIT_SUCCESS;
}

/**
 * Builds the Commander program and registers all commands and flags.
 */
export function buildProgram(): Command {
  const program = new Command();

  program
    .name('lognot')
    .description('Conventional Commits changelog & release-notes CLI')
    .version('0.1.0', '-V, --app-version', 'Output the lognot CLI version')
    .option('--cwd <path>', 'Working directory')
    .option('--verbose', 'Enable verbose logging')
    .option('--no-color', 'Disable colored terminal output')
    .option('--json', 'Output machine-readable JSON')
    .option('--dry-run', 'Print output without writing changes')
    .option('--from <ref>', 'Start ref of git commit range (default: latest tag)')
    .option('--to <ref>', 'End ref of git commit range (default: HEAD)')
    .option('--version <version>', 'Force a specific release version')
    .option('--bump <strategy>', 'Bump strategy (auto|major|minor|patch)')
    .option('--out <file>', 'Output changelog file (default: CHANGELOG.md)')
    .option('--format <format>', 'Output format (keepachangelog|release)')
    .option('--stdout', 'Print changelog directly to stdout')
    .option('--package <name>', 'Scope to monorepo package defined in config')
    .option('--force', 'Overwrite existing files or duplicate version headers')
    .action(async (_options, cmd) => {
      const exitCode = await executeGenerate(cmd.optsWithGlobals());
      if (exitCode !== 0) {
        process.exitCode = exitCode;
      }
    });

  program
    .command('check')
    .description('Validate commit messages in range according to Conventional Commits')
    .option('--from <ref>', 'Start ref of git commit range')
    .option('--to <ref>', 'End ref of git commit range')
    .option('--package <name>', 'Scope to monorepo package')
    .action(async (_options, cmd) => {
      const exitCode = await executeCheck(cmd.optsWithGlobals());
      if (exitCode !== 0) {
        process.exitCode = exitCode;
      }
    });

  program
    .command('init')
    .description('Create a lognot.config.json file with sensible defaults')
    .option('--force', 'Overwrite existing configuration file')
    .action(async (_options, cmd) => {
      const exitCode = await executeInit(cmd.optsWithGlobals());
      if (exitCode !== 0) {
        process.exitCode = exitCode;
      }
    });

  program
    .command('release')
    .description('Create or update a GitHub release for the latest version')
    .option('--from <ref>', 'Start ref of git commit range')
    .option('--to <ref>', 'End ref of git commit range')
    .option('--draft', 'Create release as a draft')
    .option('--prerelease', 'Create release as a pre-release')
    .option('--name <title>', 'Custom release title')
    .option('--package <name>', 'Scope to monorepo package')
    .action(async (_options, cmd) => {
      const exitCode = await executeRelease(cmd.optsWithGlobals());
      if (exitCode !== 0) {
        process.exitCode = exitCode;
      }
    });

  return program;
}

/**
 * Main CLI entry point.
 */
export async function run(argv: string[] = process.argv): Promise<number> {
  const isJson = argv.includes('--json');
  try {
    const program = buildProgram();
    await program.parseAsync(argv);
    return typeof process.exitCode === 'number' ? process.exitCode : EXIT_SUCCESS;
  } catch (err: unknown) {
    if (err instanceof CliError) {
      if (isJson) {
        console.error(JSON.stringify({ error: err.message, code: err.code }));
      } else {
        console.error(chalk.red(err.message));
      }
      return err.code;
    }

    const msg = err instanceof Error ? err.message : String(err);
    if (isJson) {
      console.error(JSON.stringify({ error: msg, code: EXIT_UNEXPECTED_ERROR }));
    } else {
      console.error(chalk.red(`Unexpected error: ${msg}`));
    }
    return EXIT_UNEXPECTED_ERROR;
  }
}

// Only invoke run when executed directly as CLI
const isDirectExecution =
  process.argv[1] &&
  (process.argv[1].endsWith('/cli.js') ||
    process.argv[1].endsWith('/cli.ts') ||
    process.argv[1].endsWith('/lognot'));

if (isDirectExecution) {
  run(process.argv).then((code) => {
    if (code !== 0) {
      process.exit(code);
    }
  });
}
