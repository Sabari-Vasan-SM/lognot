import { simpleGit, SimpleGit } from 'simple-git';
import semver from 'semver';
import type { RawGitCommit } from './types.js';

export const FIELD_SEP = '\x1f';
export const RECORD_SEP = '\x1e';

/**
 * Normalizes git remote URL (SSH or HTTPS) into a standard HTTPS URL.
 * e.g. "git@github.com:owner/repo.git" -> "https://github.com/owner/repo"
 * "https://github.com/owner/repo.git" -> "https://github.com/owner/repo"
 */
export function normalizeRepoUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  let url = rawUrl.trim();
  if (!url) return undefined;

  // Handle SSH style: git@github.com:owner/repo.git or ssh://git@github.com/owner/repo.git
  const scpMatch = url.match(/^(?:ssh:\/\/)?git@([^:]+):([^/].+?)(?:\.git)?$/);
  if (scpMatch && scpMatch[1] && scpMatch[2]) {
    return `https://${scpMatch[1]}/${scpMatch[2]}`;
  }

  // Handle ssh:// url style
  if (url.startsWith('ssh://')) {
    url = url.replace(/^ssh:\/\/(?:[^@]+@)?/, 'https://');
  }

  // Remove .git suffix
  url = url.replace(/\.git$/, '');

  // If http/https, clean trailing slashes
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url.replace(/\/+$/, '');
  }

  return url;
}

/**
 * Creates a configured simple-git instance.
 */
export function getGit(cwd: string = process.cwd()): SimpleGit {
  return simpleGit({ baseDir: cwd });
}

/**
 * Checks if the given directory is inside a valid git repository.
 */
export async function isGitRepo(cwd: string = process.cwd()): Promise<boolean> {
  try {
    const git = getGit(cwd);
    const isRepo = await git.checkIsRepo();
    return isRepo;
  } catch {
    return false;
  }
}

/**
 * Checks if the repository is a shallow clone.
 */
export async function isShallowRepo(cwd: string = process.cwd()): Promise<boolean> {
  try {
    const git = getGit(cwd);
    const res = await git.raw(['rev-parse', '--is-shallow-repository']);
    return res.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Auto-detects the repository origin URL from git config.
 */
export async function getRemoteRepoUrl(cwd: string = process.cwd()): Promise<string | undefined> {
  try {
    const git = getGit(cwd);
    const remote = await git.raw(['remote', 'get-url', 'origin']);
    return normalizeRepoUrl(remote.trim());
  } catch {
    return undefined;
  }
}

/**
 * Gets all git tags in the repository.
 */
export async function getTags(cwd: string = process.cwd()): Promise<string[]> {
  const git = getGit(cwd);
  const tagResult = await git.tags();
  return tagResult.all;
}

/**
 * Finds the latest valid semver tag in the repository matching the optional prefix or package name.
 *
 * @param cwd Git working directory
 * @param tagPrefix Tag prefix like "v" (ignored if package is specified)
 * @param packageName Optional monorepo package name (expects tags like "package@version" or "package@vversion")
 * @param onWarn Optional logger callback for invalid semver tags
 */
export async function getLatestSemverTag(
  cwd: string = process.cwd(),
  tagPrefix = 'v',
  packageName?: string,
  onWarn?: (msg: string) => void,
): Promise<{ tag: string; version: string } | null> {
  const tags = await getTags(cwd);
  if (tags.length === 0) {
    return null;
  }

  interface SemverTagItem {
    tag: string;
    version: string;
  }

  const validItems: SemverTagItem[] = [];

  for (const tag of tags) {
    let cleanVersion: string | null = null;

    if (packageName) {
      // Monorepo package tag format: <packageName>@<version> or <packageName>@v<version>
      const prefix = `${packageName}@`;
      if (tag.startsWith(prefix)) {
        const rawVer = tag.slice(prefix.length);
        cleanVersion = semver.clean(rawVer) || semver.valid(rawVer);
      }
    } else {
      // Root tag format: v1.0.0 or 1.0.0
      if (tagPrefix && tag.startsWith(tagPrefix)) {
        cleanVersion = semver.clean(tag);
      } else {
        cleanVersion = semver.clean(tag) || semver.valid(tag);
      }
    }

    if (cleanVersion) {
      validItems.push({ tag, version: cleanVersion });
    } else if (onWarn) {
      onWarn(`Ignoring non-semver tag: "${tag}"`);
    }
  }

  if (validItems.length === 0) {
    return null;
  }

  // Sort descending by semver
  validItems.sort((a, b) => semver.rcompare(a.version, b.version));

  return validItems[0] ?? null;
}

export interface GetCommitsOptions {
  cwd?: string;
  from?: string;
  to?: string;
  packagePath?: string;
}

/**
 * Fetches raw git commits between refs, optionally scoped to a monorepo package directory.
 */
export async function getCommits(options: GetCommitsOptions = {}): Promise<RawGitCommit[]> {
  const cwd = options.cwd ?? process.cwd();
  const git = getGit(cwd);
  const to = options.to ?? 'HEAD';

  const formatArg = `--format=%H${FIELD_SEP}%an${FIELD_SEP}%ae${FIELD_SEP}%aI${FIELD_SEP}%B${RECORD_SEP}`;

  const args: string[] = ['log', formatArg];

  if (options.from) {
    args.push(`${options.from}..${to}`);
  } else {
    args.push(to);
  }

  if (options.packagePath) {
    args.push('--', options.packagePath);
  }

  let logOutput: string;
  try {
    logOutput = await git.raw(args);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Git error retrieving commits for range ${options.from ?? 'root'}..${to}: ${message}`,
    );
  }

  if (!logOutput.trim()) {
    return [];
  }

  const rawEntries = logOutput.split(RECORD_SEP);
  const commits: RawGitCommit[] = [];

  for (const entry of rawEntries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(FIELD_SEP);
    if (parts.length >= 5) {
      const sha = parts[0]?.trim() ?? '';
      const authorName = parts[1]?.trim() ?? '';
      const authorEmail = parts[2]?.trim() ?? '';
      const date = parts[3]?.trim() ?? '';
      const raw = parts.slice(4).join(FIELD_SEP).trim();

      if (sha) {
        commits.push({
          sha,
          authorName,
          authorEmail,
          date,
          raw,
        });
      }
    }
  }

  return commits;
}
