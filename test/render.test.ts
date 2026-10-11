import { describe, it, expect } from 'vitest';
import { renderChangelog, formatCommitItem } from '../src/render.js';
import type { GroupedCommits, ParsedCommit } from '../src/types.js';

describe('render.ts', () => {
  const commit1: ParsedCommit = {
    sha: 'a1b2c3d4e5f67890123456789012345678901234',
    shortSha: 'a1b2c3d',
    header: 'feat(auth): Add OTP login',
    type: 'feat',
    scope: 'auth',
    subject: 'Add OTP login',
    body: 'closes #42',
    footer: null,
    isBreaking: false,
    references: [{ raw: 'closes #42', prefix: '#', action: 'closes', issue: '42' }],
    authorName: 'Alice',
    authorEmail: 'alice@example.com',
    date: '2026-10-11T10:00:00Z',
    raw: 'feat(auth): Add OTP login\n\ncloses #42',
    isMerge: false,
  };

  const commit2: ParsedCommit = {
    sha: 'b2c3d4e5f6a17890123456789012345678901234',
    shortSha: 'b2c3d4e',
    header: 'fix: resolve race condition in worker #99',
    type: 'fix',
    scope: null,
    subject: 'resolve race condition in worker #99',
    body: null,
    footer: null,
    isBreaking: false,
    references: [{ raw: '#99', prefix: '#', action: null, issue: '99' }],
    authorName: 'Bob',
    authorEmail: 'bob@example.com',
    date: '2026-10-11T09:00:00Z',
    raw: 'fix: resolve race condition in worker #99',
    isMerge: false,
  };

  const commitBreaking: ParsedCommit = {
    sha: 'c3d4e5f6a1b27890123456789012345678901234',
    shortSha: 'c3d4e5f',
    header: 'feat(api)!: migrate to GraphQL',
    type: 'feat',
    scope: 'api',
    subject: 'migrate to GraphQL',
    body: null,
    footer: 'BREAKING CHANGE: REST v1 endpoints removed',
    isBreaking: true,
    breakingDescription: 'REST v1 endpoints removed',
    references: [],
    authorName: 'Charlie',
    authorEmail: 'charlie@example.com',
    date: '2026-10-11T08:00:00Z',
    raw: 'feat(api)!: migrate to GraphQL\n\nBREAKING CHANGE: REST v1 endpoints removed',
    isMerge: false,
  };

  const commitOther: ParsedCommit = {
    sha: 'd4e5f6a1b2c37890123456789012345678901234',
    shortSha: 'd4e5f6a',
    header: 'misc cleanup and refactor without convention',
    type: null,
    scope: null,
    subject: 'misc cleanup and refactor without convention',
    body: null,
    footer: null,
    isBreaking: false,
    references: [],
    authorName: 'Dave',
    authorEmail: 'dave@example.com',
    date: '2026-10-11T07:00:00Z',
    raw: 'misc cleanup and refactor without convention',
    isMerge: false,
  };

  const mockGrouped: GroupedCommits = {
    breaking: [commitBreaking],
    groups: [
      {
        type: 'feat',
        title: 'Features',
        emoji: '✨',
        scopes: {
          '': [],
          api: [commitBreaking],
          auth: [commit1],
        },
      },
      {
        type: 'fix',
        title: 'Bug Fixes',
        emoji: '🐛',
        scopes: {
          '': [commit2],
        },
      },
    ],
    other: [commitOther],
  };

  it('formats commit items with repo link and issue refs', () => {
    const itemWithRepo = formatCommitItem(commit1, 'https://github.com/you/repo');
    expect(itemWithRepo).toBe(
      '- Add OTP login ([a1b2c3d](https://github.com/you/repo/commit/a1b2c3d4e5f67890123456789012345678901234)) closes [#42](https://github.com/you/repo/issues/42)',
    );

    const itemWithoutRepo = formatCommitItem(commit2);
    expect(itemWithoutRepo).toBe('- resolve race condition in worker #99 (b2c3d4e)');
  });

  it('renders keepachangelog format correctly', () => {
    const markdown = renderChangelog(mockGrouped, {
      version: '1.3.0',
      date: '2026-10-11',
      repoUrl: 'https://github.com/you/repo',
      format: 'keepachangelog',
    });

    expect(markdown).toMatchInlineSnapshot(`
      "## [1.3.0] - 2026-10-11

      ### 💥 Breaking Changes

      - **api:** REST v1 endpoints removed ([c3d4e5f](https://github.com/you/repo/commit/c3d4e5f6a1b27890123456789012345678901234))

      ### ✨ Features

      #### api

      - migrate to GraphQL ([c3d4e5f](https://github.com/you/repo/commit/c3d4e5f6a1b27890123456789012345678901234))

      #### auth

      - Add OTP login ([a1b2c3d](https://github.com/you/repo/commit/a1b2c3d4e5f67890123456789012345678901234)) closes [#42](https://github.com/you/repo/issues/42)

      ### 🐛 Bug Fixes

      - resolve race condition in worker [#99](https://github.com/you/repo/issues/99) ([b2c3d4e](https://github.com/you/repo/commit/b2c3d4e5f6a17890123456789012345678901234))

      ### 📦 Other Changes

      - misc cleanup and refactor without convention ([d4e5f6a](https://github.com/you/repo/commit/d4e5f6a1b2c37890123456789012345678901234))"
    `);
  });

  it('renders release format correctly without version heading', () => {
    const markdown = renderChangelog(mockGrouped, {
      version: '1.3.0',
      date: '2026-10-11',
      repoUrl: 'https://github.com/you/repo',
      format: 'release',
    });

    expect(markdown).not.toContain('## [1.3.0] - 2026-10-11');
    expect(markdown).toContain('## 💥 Breaking Changes');
    expect(markdown).toContain('## ✨ Features');
    expect(markdown).toContain('### auth');
  });
});
