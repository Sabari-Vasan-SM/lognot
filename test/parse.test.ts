import { describe, it, expect } from 'vitest';
import {
  parseCommit,
  parseCommits,
  extractReferences,
  validateConventionalHeader,
} from '../src/parse.js';
import type { RawGitCommit } from '../src/types.js';

describe('parse.ts', () => {
  const baseCommit: RawGitCommit = {
    sha: 'abcdef1234567890abcdef1234567890abcdef12',
    raw: 'feat(auth): add OTP authentication',
    authorName: 'John Doe',
    authorEmail: 'john@example.com',
    date: '2026-10-11T12:00:00Z',
  };

  it('parses standard conventional commit with scope', () => {
    const parsed = parseCommit(baseCommit);
    expect(parsed.type).toBe('feat');
    expect(parsed.scope).toBe('auth');
    expect(parsed.subject).toBe('add OTP authentication');
    expect(parsed.shortSha).toBe('abcdef1');
    expect(parsed.isBreaking).toBe(false);
    expect(parsed.isMerge).toBe(false);
  });

  it('parses breaking change with ! marker', () => {
    const commit: RawGitCommit = {
      ...baseCommit,
      raw: 'feat(auth)!: replace sessions with JWT',
    };
    const parsed = parseCommit(commit);
    expect(parsed.type).toBe('feat');
    expect(parsed.scope).toBe('auth');
    expect(parsed.subject).toBe('replace sessions with JWT');
    expect(parsed.isBreaking).toBe(true);
    expect(parsed.breakingDescription).toBe('replace sessions with JWT');
  });

  it('parses breaking change with BREAKING CHANGE footer', () => {
    const commit: RawGitCommit = {
      ...baseCommit,
      raw: 'fix(api): change user payload\n\nBREAKING CHANGE: id is now a UUID string',
    };
    const parsed = parseCommit(commit);
    expect(parsed.type).toBe('fix');
    expect(parsed.scope).toBe('api');
    expect(parsed.isBreaking).toBe(true);
    expect(parsed.breakingDescription).toBe('id is now a UUID string');
  });

  it('parses BREAKING-CHANGE with hyphen', () => {
    const commit: RawGitCommit = {
      ...baseCommit,
      raw: 'refactor: simplify database config\n\nBREAKING-CHANGE: db URL is required',
    };
    const parsed = parseCommit(commit);
    expect(parsed.isBreaking).toBe(true);
    expect(parsed.breakingDescription).toBe('db URL is required');
  });

  it('extracts issue and PR references from subject and body', () => {
    const text = 'fix(core): resolve null pointer #42\n\nCloses #100, fixes #200 and refs #300';
    const refs = extractReferences(text);
    expect(refs).toHaveLength(4);
    expect(refs[0]).toEqual({ raw: '#42', prefix: '#', action: null, issue: '42' });
    expect(refs[1]).toEqual({ raw: 'Closes #100', prefix: '#', action: 'closes', issue: '100' });
    expect(refs[2]).toEqual({ raw: 'fixes #200', prefix: '#', action: 'fixes', issue: '200' });
    expect(refs[3]).toEqual({ raw: 'refs #300', prefix: '#', action: 'refs', issue: '300' });
  });

  it('handles non-conventional commits gracefully as other changes', () => {
    const commit: RawGitCommit = {
      ...baseCommit,
      raw: 'just updating some random files for testing',
    };
    const parsed = parseCommit(commit);
    expect(parsed.type).toBeNull();
    expect(parsed.scope).toBeNull();
    expect(parsed.subject).toBe('just updating some random files for testing');
    expect(parsed.isBreaking).toBe(false);
  });

  it('detects merge commits', () => {
    const commit: RawGitCommit = {
      ...baseCommit,
      raw: "Merge branch 'feature-1' of github.com:org/repo into main",
    };
    const parsed = parseCommit(commit);
    expect(parsed.isMerge).toBe(true);
  });

  it('handles git revert commits', () => {
    const commit: RawGitCommit = {
      ...baseCommit,
      raw: 'revert(auth): rollback OTP changes',
    };
    const parsed = parseCommit(commit);
    expect(parsed.type).toBe('revert');
    expect(parsed.scope).toBe('auth');
    expect(parsed.subject).toBe('rollback OTP changes');

    const commit2: RawGitCommit = {
      ...baseCommit,
      raw: 'Revert "feat: something bad"',
    };
    const parsed2 = parseCommit(commit2);
    expect(parsed2.type).toBe('revert');
    expect(parsed2.subject).toBe('feat: something bad');
  });

  it('handles emoji and unicode in commit message', () => {
    const commit: RawGitCommit = {
      ...baseCommit,
      raw: 'feat(ui): ✨ support dark mode with 🌙 theme',
    };
    const parsed = parseCommit(commit);
    expect(parsed.type).toBe('feat');
    expect(parsed.scope).toBe('ui');
    expect(parsed.subject).toBe('✨ support dark mode with 🌙 theme');
  });

  it('validates conventional headers correctly', () => {
    expect(validateConventionalHeader('feat: add user login').valid).toBe(true);
    expect(validateConventionalHeader('feat(auth)!: add user login').valid).toBe(true);
    expect(validateConventionalHeader('fix: resolve bug').valid).toBe(true);
    expect(validateConventionalHeader('revert: revert bad commit').valid).toBe(true);
    expect(validateConventionalHeader("Merge branch 'main'").valid).toBe(true);

    const invalidEmpty = validateConventionalHeader('');
    expect(invalidEmpty.valid).toBe(false);

    const invalidFormat = validateConventionalHeader('random commit message');
    expect(invalidFormat.valid).toBe(false);

    const invalidType = validateConventionalHeader('foo(bar): unknown type');
    expect(invalidType.valid).toBe(false);
    expect(invalidType.reason).toContain('foo');
  });

  it('parses a list of commits via parseCommits', () => {
    const commits: RawGitCommit[] = [
      { ...baseCommit, sha: '1111111111111111111111111111111111111111', raw: 'feat: one' },
      { ...baseCommit, sha: '2222222222222222222222222222222222222222', raw: 'fix: two' },
    ];
    const results = parseCommits(commits);
    expect(results).toHaveLength(2);
    expect(results[0]?.type).toBe('feat');
    expect(results[1]?.type).toBe('fix');
  });
});
