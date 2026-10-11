import semver from 'semver';
import type { ParsedCommit, BumpType } from './types.js';

export interface VersionDetermination {
  version: string;
  previousVersion: string | null;
  bumpType: BumpType | null;
  isInitial: boolean;
  reason: string;
}

/**
 * Determines the required semver bump type from parsed commits.
 * Returns null if no bump is warranted (e.g. only docs, chore, style).
 *
 * @param commits List of parsed commits
 */
export function determineBumpType(commits: ParsedCommit[]): BumpType | null {
  let hasFeat = false;
  let hasPatch = false;

  for (const commit of commits) {
    if (commit.isBreaking) {
      return 'major';
    }

    const type = commit.type?.toLowerCase();
    if (type === 'feat') {
      hasFeat = true;
    } else if (type === 'fix' || type === 'perf' || type === 'security') {
      hasPatch = true;
    }
  }

  if (hasFeat) {
    return 'minor';
  }

  if (hasPatch) {
    return 'patch';
  }

  return null;
}

/**
 * Computes the next version given a base version and bump instruction.
 *
 * @param currentTag The latest git tag (e.g., 'v1.2.0', '1.2.0', or null/undefined if no tags exist)
 * @param bump Bump strategy: 'auto', 'major', 'minor', 'patch', or a forced version string
 * @param commits List of parsed commits to analyze if bump is 'auto'
 */
export function calculateNextVersion(
  currentTag: string | null | undefined,
  bump: 'auto' | BumpType = 'auto',
  commits: ParsedCommit[] = [],
  forcedVersion?: string,
): VersionDetermination {
  if (forcedVersion) {
    const cleanedForced = semver.clean(forcedVersion) || semver.valid(forcedVersion);
    if (!cleanedForced) {
      throw new Error(`Invalid forced version: "${forcedVersion}". Must be a valid semver.`);
    }
    const cleanCurrent = currentTag ? semver.clean(currentTag) : null;
    return {
      version: cleanedForced,
      previousVersion: cleanCurrent,
      bumpType: null,
      isInitial: !currentTag,
      reason: `Manually forced version to ${cleanedForced}`,
    };
  }

  const cleanCurrent = currentTag ? semver.clean(currentTag) : null;

  // Case 1: No previous tags exist -> initial release 0.1.0
  if (!cleanCurrent) {
    return {
      version: '0.1.0',
      previousVersion: null,
      bumpType: 'minor',
      isInitial: true,
      reason: 'No semver tags found. Starting initial version at 0.1.0',
    };
  }

  // Case 2: Explicit bump type
  if (bump !== 'auto') {
    const next = semver.inc(cleanCurrent, bump);
    if (!next) {
      throw new Error(`Failed to bump version ${cleanCurrent} with bump type ${bump}`);
    }
    return {
      version: next,
      previousVersion: cleanCurrent,
      bumpType: bump,
      isInitial: false,
      reason: `Explicit ${bump} bump from ${cleanCurrent} to ${next}`,
    };
  }

  // Case 3: Auto-detect bump type from commits
  const detectedBump = determineBumpType(commits);
  if (!detectedBump) {
    return {
      version: cleanCurrent,
      previousVersion: cleanCurrent,
      bumpType: null,
      isInitial: false,
      reason: 'No commits warrant a version bump (only chores, docs, or non-release commits).',
    };
  }

  const next = semver.inc(cleanCurrent, detectedBump);
  if (!next) {
    throw new Error(`Failed to bump version ${cleanCurrent} with detected bump ${detectedBump}`);
  }

  return {
    version: next,
    previousVersion: cleanCurrent,
    bumpType: detectedBump,
    isInitial: false,
    reason: `Automated ${detectedBump} bump based on commit history (${cleanCurrent} -> ${next})`,
  };
}
