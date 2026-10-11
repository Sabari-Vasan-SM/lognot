import type { GroupedCommits, ParsedCommit, RenderOptions } from './types.js';
import { formatCommitLink, linkifyReferences } from './links.js';

export const KEEP_A_CHANGELOG_HEADER = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
`;

/**
 * Formats a single commit entry item as a markdown bullet point.
 * @param commit Parsed commit object
 * @param repoUrl Optional repository URL for markdown linking
 * @param customText Optional text override (used for breaking change descriptions)
 */
export function formatCommitItem(
  commit: ParsedCommit,
  repoUrl?: string,
  customText?: string,
): string {
  const commitLink = formatCommitLink(commit.sha, repoUrl);
  const text = customText ?? commit.subject ?? commit.header;
  const linkedText = linkifyReferences(text, repoUrl);

  // Check if there are issue references from the commit that were NOT in the subject
  const extraRefs: string[] = [];
  for (const ref of commit.references) {
    // If the subject doesn't already mention this issue number
    if (!text.includes(`#${ref.issue}`)) {
      const actionPrefix = ref.action ? `${ref.action} ` : '';
      const linkedIssue = linkifyReferences(`#${ref.issue}`, repoUrl);
      extraRefs.push(`${actionPrefix}${linkedIssue}`);
    }
  }

  const extraStr = extraRefs.length > 0 ? ` ${extraRefs.join(', ')}` : '';
  return `- ${linkedText} (${commitLink})${extraStr}`;
}

/**
 * Renders a changelog entry in "keepachangelog" or "release" format.
 *
 * @param grouped Grouped commits
 * @param options Rendering configuration including version, date, format, and repoUrl
 */
export function renderChangelog(grouped: GroupedCommits, options: RenderOptions): string {
  const lines: string[] = [];
  const format = options.format ?? 'keepachangelog';
  const isRelease = format === 'release';

  // Release format omits the top-level version heading because GitHub releases have their own header.
  if (!isRelease) {
    lines.push(`## [${options.version}] - ${options.date}`);
    lines.push('');
  }

  const hSection = isRelease ? '##' : '###';
  const hScope = isRelease ? '###' : '####';

  // 1. Breaking Changes section at the top if any
  if (grouped.breaking.length > 0) {
    lines.push(`${hSection} 💥 Breaking Changes`);
    lines.push('');
    for (const commit of grouped.breaking) {
      const desc = commit.breakingDescription ?? commit.subject ?? commit.header;
      const scopePrefix = commit.scope ? `**${commit.scope}:** ` : '';
      lines.push(formatCommitItem(commit, options.repoUrl, `${scopePrefix}${desc}`));
    }
    lines.push('');
  }

  // 2. Standard groups (feat, fix, perf, etc.)
  for (const group of grouped.groups) {
    const hasEntries = Object.values(group.scopes).some((list) => list.length > 0);
    if (!hasEntries) {
      continue;
    }

    lines.push(`${hSection} ${group.emoji} ${group.title}`);
    lines.push('');

    // Unscoped commits first (key '')
    const unscoped = group.scopes[''];
    if (unscoped && unscoped.length > 0) {
      for (const commit of unscoped) {
        lines.push(formatCommitItem(commit, options.repoUrl));
      }
      lines.push('');
    }

    // Scoped commits next
    for (const [scope, scopedCommits] of Object.entries(group.scopes)) {
      if (scope === '' || scopedCommits.length === 0) {
        continue;
      }
      lines.push(`${hScope} ${scope}`);
      lines.push('');
      for (const commit of scopedCommits) {
        lines.push(formatCommitItem(commit, options.repoUrl));
      }
      lines.push('');
    }
  }

  // 3. Other Changes section if any
  if (grouped.other.length > 0) {
    lines.push(`${hSection} 📦 Other Changes`);
    lines.push('');
    for (const commit of grouped.other) {
      lines.push(formatCommitItem(commit, options.repoUrl));
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}
