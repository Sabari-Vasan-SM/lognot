import { describe, it, expect } from 'vitest';
import { groupCommits } from '../src/group.js';
import type { ParsedCommit } from '../src/types.js';

describe('group.ts', () => {
  const mockCommit = (overrides: Partial<ParsedCommit>): ParsedCommit => ({
    sha: '1234567890abcdef',
    shortSha: '1234567',
    header: 'feat: test',
    type: 'feat',
    scope: null,
    subject: 'test commit',
    body: null,
    footer: null,
    isBreaking: false,
    references: [],
    authorName: 'Developer',
    authorEmail: 'dev@test.com',
    date: '2026-10-11T10:00:00Z',
    raw: 'feat: test',
    isMerge: false,
    ...overrides,
  });

  it('groups commits by type in default section order', () => {
    const commits = [
      mockCommit({ type: 'fix', subject: 'fix bug', date: '2026-10-11T09:00:00Z' }),
      mockCommit({ type: 'feat', subject: 'new feature', date: '2026-10-11T10:00:00Z' }),
    ];

    const grouped = groupCommits(commits);
    expect(grouped.groups).toHaveLength(2);
    // feat comes before fix in default sections
    expect(grouped.groups[0]?.type).toBe('feat');
    expect(grouped.groups[1]?.type).toBe('fix');
    expect(grouped.breaking).toHaveLength(0);
    expect(grouped.other).toHaveLength(0);
  });

  it('places breaking changes into the breaking section AND their normal section', () => {
    const commits = [
      mockCommit({
        type: 'feat',
        scope: 'auth',
        subject: 'remove legacy auth',
        isBreaking: true,
        breakingDescription: 'legacy auth removed',
      }),
      mockCommit({ type: 'feat', scope: 'auth', subject: 'normal feature' }),
    ];

    const grouped = groupCommits(commits);
    expect(grouped.breaking).toHaveLength(1);
    expect(grouped.breaking[0]?.subject).toBe('remove legacy auth');

    const featGroup = grouped.groups.find((g) => g.type === 'feat');
    expect(featGroup).toBeDefined();
    expect(featGroup?.scopes['auth']).toHaveLength(2);
  });

  it('groups by scope and orders unscoped commits first, then alphabetical scopes', () => {
    const commits = [
      mockCommit({ type: 'feat', scope: 'billing', subject: 'stripe integration' }),
      mockCommit({ type: 'feat', scope: null, subject: 'unscoped feature' }),
      mockCommit({ type: 'feat', scope: 'auth', subject: 'oauth2 support' }),
    ];

    const grouped = groupCommits(commits);
    const featGroup = grouped.groups[0]!;
    const scopeKeys = Object.keys(featGroup.scopes);

    expect(scopeKeys).toEqual(['', 'auth', 'billing']);
    expect(featGroup.scopes['']?.[0]?.subject).toBe('unscoped feature');
    expect(featGroup.scopes['auth']?.[0]?.subject).toBe('oauth2 support');
    expect(featGroup.scopes['billing']?.[0]?.subject).toBe('stripe integration');
  });

  it('sorts commits within the same scope newest first', () => {
    const commits = [
      mockCommit({
        type: 'fix',
        scope: 'core',
        subject: 'older fix',
        date: '2026-10-10T08:00:00Z',
      }),
      mockCommit({
        type: 'fix',
        scope: 'core',
        subject: 'newer fix',
        date: '2026-10-11T12:00:00Z',
      }),
    ];

    const grouped = groupCommits(commits);
    const fixGroup = grouped.groups[0]!;
    const coreFixes = fixGroup.scopes['core']!;
    expect(coreFixes[0]?.subject).toBe('newer fix');
    expect(coreFixes[1]?.subject).toBe('older fix');
  });

  it('ignores merge commits by default and respects includeMergeCommits option', () => {
    const commits = [
      mockCommit({ type: null, isMerge: true, raw: 'Merge branch main' }),
      mockCommit({ type: 'feat', subject: 'my feature' }),
    ];

    const defaultGrouped = groupCommits(commits);
    expect(defaultGrouped.other).toHaveLength(0);

    const withMerge = groupCommits(commits, { includeMergeCommits: true });
    expect(withMerge.other).toHaveLength(1);
  });

  it('ignores default ignoreTypes (chore, ci, test, style, build)', () => {
    const commits = [
      mockCommit({ type: 'chore', subject: 'update deps' }),
      mockCommit({ type: 'ci', subject: 'fix github workflow' }),
      mockCommit({ type: 'feat', subject: 'new feature' }),
    ];

    const grouped = groupCommits(commits);
    expect(grouped.groups).toHaveLength(1);
    expect(grouped.groups[0]?.type).toBe('feat');
    expect(grouped.other).toHaveLength(0);
  });

  it('places unknown/unconventional commits into the other section', () => {
    const commits = [
      mockCommit({ type: null, subject: 'misc untracked change' }),
      mockCommit({ type: 'custom', subject: 'custom type not in sections' }),
    ];

    const grouped = groupCommits(commits);
    expect(grouped.other).toHaveLength(2);
    expect(grouped.other[0]?.subject).toBe('misc untracked change');
    expect(grouped.other[1]?.subject).toBe('custom type not in sections');
  });
});
