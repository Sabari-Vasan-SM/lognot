import type { ParsedCommit, GroupedCommits, SectionDef, CommitGroup } from './types.js';

export const DEFAULT_SECTIONS: Record<string, SectionDef> = {
  feat: { title: 'Features', emoji: '✨' },
  fix: { title: 'Bug Fixes', emoji: '🐛' },
  perf: { title: 'Performance', emoji: '⚡' },
  security: { title: 'Security', emoji: '🔒' },
  refactor: { title: 'Refactoring', emoji: '♻️' },
  docs: { title: 'Documentation', emoji: '📝' },
  revert: { title: 'Reverts', emoji: '⏪' },
};

export const DEFAULT_IGNORE_TYPES = ['chore', 'ci', 'test', 'style', 'build'];

export interface GroupOptions {
  sections?: Record<string, SectionDef>;
  ignoreTypes?: string[];
  includeMergeCommits?: boolean;
}

/**
 * Sorts commits by date descending (newest first).
 */
function sortByDateDescending(a: ParsedCommit, b: ParsedCommit): number {
  const dateA = new Date(a.date).getTime();
  const dateB = new Date(b.date).getTime();
  if (isNaN(dateA) || isNaN(dateB)) {
    return 0;
  }
  return dateB - dateA;
}

/**
 * Groups parsed commits into breaking changes, section-based categories, and other changes.
 *
 * @param commits List of parsed commits
 * @param options Customization options for sections, ignored types, and merge commits
 */
export function groupCommits(commits: ParsedCommit[], options: GroupOptions = {}): GroupedCommits {
  const sectionsConfig = { ...DEFAULT_SECTIONS, ...options.sections };
  const ignoreTypes = new Set(options.ignoreTypes ?? DEFAULT_IGNORE_TYPES);
  const includeMergeCommits = options.includeMergeCommits ?? false;

  const breaking: ParsedCommit[] = [];
  const other: ParsedCommit[] = [];

  // Group by type -> scope -> commits
  const typeMap = new Map<string, Map<string, ParsedCommit[]>>();

  for (const commit of commits) {
    if (commit.isMerge && !includeMergeCommits) {
      continue;
    }

    if (commit.isBreaking) {
      breaking.push(commit);
    }

    const type = commit.type?.toLowerCase();

    // If type is ignored and NOT a breaking change, skip it from normal sections
    if (type && ignoreTypes.has(type)) {
      continue;
    }

    if (!type || !sectionsConfig[type]) {
      // If it doesn't match any known section type, put into other (unless it's an ignored type)
      if (!type || !ignoreTypes.has(type)) {
        other.push(commit);
      }
      continue;
    }

    // Add to recognized type
    if (!typeMap.has(type)) {
      typeMap.set(type, new Map<string, ParsedCommit[]>());
    }
    const scopesMap = typeMap.get(type)!;
    const scopeKey = commit.scope ?? '';
    if (!scopesMap.has(scopeKey)) {
      scopesMap.set(scopeKey, []);
    }
    scopesMap.get(scopeKey)!.push(commit);
  }

  // Sort breaking commits newest first
  breaking.sort(sortByDateDescending);
  other.sort(sortByDateDescending);

  // Build the list of groups in configured section order
  const groups: CommitGroup[] = [];

  for (const [type, sectionDef] of Object.entries(sectionsConfig)) {
    const scopesMap = typeMap.get(type);
    if (!scopesMap || scopesMap.size === 0) {
      continue;
    }

    // Sort scopes: unscoped ('') first, then alphabetical
    const sortedScopeKeys = Array.from(scopesMap.keys()).sort((a, b) => {
      if (a === '') return -1;
      if (b === '') return 1;
      return a.localeCompare(b);
    });

    const scopes: Record<string, ParsedCommit[]> = {};
    for (const scopeKey of sortedScopeKeys) {
      const commitList = [...(scopesMap.get(scopeKey) ?? [])];
      commitList.sort(sortByDateDescending);
      scopes[scopeKey] = commitList;
    }

    groups.push({
      type,
      title: sectionDef.title,
      emoji: sectionDef.emoji,
      scopes,
    });
  }

  return {
    breaking,
    groups,
    other,
  };
}
