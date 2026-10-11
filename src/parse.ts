import { CommitParser } from 'conventional-commits-parser';
import type { RawGitCommit, ParsedCommit, CommitRef } from './types.js';

const parser = new CommitParser({
  headerPattern: /^(\w*)(?:\(([\w$.\-* ]*)\))?(!)?:\s*(.*)$/,
  headerCorrespondence: ['type', 'scope', 'breaking', 'subject'],
  noteKeywords: ['BREAKING CHANGE', 'BREAKING-CHANGE'],
  issuePrefixes: ['#'],
});

const MERGE_PATTERN = /^Merge (?:branch|pull request|remote-tracking branch|tag) /i;
const REVERT_PATTERN = /^revert(?:(?:\(([\w$.\-* ]*)\))?:\s*|\s+"?)(.*)$/i;
const ISSUE_REF_PATTERN = /(?:(closes?|closed|fixes?|fixed|resolves?|resolved|refs?)\s+)?#(\d+)/gi;

/**
 * Extracts issue/PR references from a commit message.
 * @param text The commit message or body
 */
export function extractReferences(text: string): CommitRef[] {
  const refs: CommitRef[] = [];
  const matches = text.matchAll(ISSUE_REF_PATTERN);
  for (const match of matches) {
    const raw = match[0];
    const action = match[1]?.toLowerCase() ?? null;
    const issue = match[2];
    if (issue) {
      refs.push({
        raw,
        prefix: '#',
        action,
        issue,
      });
    }
  }
  return refs;
}

/**
 * Validates whether a commit header conforms to Conventional Commits specification.
 * @param header The first line of a commit message
 * @param allowedTypes Optional list of allowed types. Defaults to common standard types.
 */
export function validateConventionalHeader(
  header: string,
  allowedTypes: string[] = [
    'feat',
    'fix',
    'perf',
    'security',
    'refactor',
    'docs',
    'revert',
    'chore',
    'ci',
    'test',
    'style',
    'build',
  ],
): { valid: boolean; reason?: string } {
  const trimmed = header.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Commit message header is empty' };
  }

  // Handle revert pattern as valid
  if (REVERT_PATTERN.test(trimmed)) {
    return { valid: true };
  }

  // Handle merge pattern
  if (MERGE_PATTERN.test(trimmed)) {
    return { valid: true };
  }

  const match = trimmed.match(/^(\w+)(?:\(([\w$.\-* ]+)\))?(!)?:\s+(.+)$/);
  if (!match) {
    return {
      valid: false,
      reason: `Header "${trimmed}" does not follow Conventional Commits format "<type>(<scope>): <subject>"`,
    };
  }

  const type = match[1]?.toLowerCase();
  if (type && !allowedTypes.includes(type)) {
    return {
      valid: false,
      reason: `Type "${type}" is not recognized. Expected one of: ${allowedTypes.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Parses a raw git commit into a structured ParsedCommit object.
 * Commits that do not match the conventional pattern are preserved as "other" commits.
 * @param commit Raw commit details from git
 */
export function parseCommit(commit: RawGitCommit): ParsedCommit {
  const rawMessage = commit.raw.trim();
  const firstLine = rawMessage.split(/\r?\n/)[0]?.trim() ?? '';
  const isMerge = MERGE_PATTERN.test(firstLine);

  // Check for git revert commits
  const revertMatch = firstLine.match(REVERT_PATTERN);
  let parsedType: string | null = null;
  let parsedScope: string | null = null;
  let parsedSubject: string | null = null;
  let hasExclamationBreaking = false;

  const parsed = parser.parse(rawMessage);

  if (revertMatch && !parsed.type) {
    parsedType = 'revert';
    parsedScope = revertMatch[1] ?? null;
    parsedSubject = (revertMatch[2] ?? '').replace(/"$/, '').trim();
  } else {
    parsedType = parsed.type ? parsed.type.toLowerCase() : null;
    parsedScope = parsed.scope ? parsed.scope.trim() : null;
    parsedSubject = parsed.subject ? parsed.subject.trim() : null;
    // Breaking exclamation mark in header
    hasExclamationBreaking = Boolean(parsed.breaking && parsed.breaking === '!');
  }

  // If parser failed to find subject but we have a non-conventional first line
  if (!parsedSubject && !parsedType) {
    parsedSubject = firstLine;
  }

  // Check for BREAKING CHANGE notes
  let isBreaking = hasExclamationBreaking;
  let breakingDescription: string | undefined;

  if (parsed.notes && parsed.notes.length > 0) {
    for (const note of parsed.notes) {
      if (note.title === 'BREAKING CHANGE' || note.title === 'BREAKING-CHANGE') {
        isBreaking = true;
        if (!breakingDescription && note.text) {
          breakingDescription = note.text.trim();
        }
      }
    }
  }

  if (isBreaking && !breakingDescription && parsedSubject) {
    breakingDescription = parsedSubject;
  }

  // Extract issue references
  const references = extractReferences(rawMessage);

  return {
    sha: commit.sha,
    shortSha: commit.sha.slice(0, 7),
    header: firstLine,
    type: parsedType,
    scope: parsedScope,
    subject: parsedSubject,
    body: parsed.body ? parsed.body.trim() : null,
    footer: parsed.footer ? parsed.footer.trim() : null,
    isBreaking,
    breakingDescription,
    references,
    authorName: commit.authorName,
    authorEmail: commit.authorEmail,
    date: commit.date,
    raw: commit.raw,
    isMerge,
  };
}

/**
 * Parses multiple raw git commits.
 * @param commits List of raw git commits
 */
export function parseCommits(commits: RawGitCommit[]): ParsedCommit[] {
  return commits.map(parseCommit);
}
