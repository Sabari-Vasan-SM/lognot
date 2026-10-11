import { describe, it, expect, afterEach } from 'vitest';
import { normalizeRepoUrl, isGitRepo, getLatestSemverTag, getCommits } from '../src/git.js';
import { createTestRepo, TestRepo } from './fixtures/git-repo.js';

describe('git.ts', () => {
  let repo: TestRepo | undefined;

  afterEach(async () => {
    if (repo) {
      await repo.cleanup();
      repo = undefined;
    }
  });

  describe('normalizeRepoUrl', () => {
    it('normalizes github git@ SSH url', () => {
      expect(normalizeRepoUrl('git@github.com:owner/repo.git')).toBe(
        'https://github.com/owner/repo',
      );
    });

    it('normalizes https git url with .git suffix', () => {
      expect(normalizeRepoUrl('https://github.com/owner/repo.git')).toBe(
        'https://github.com/owner/repo',
      );
    });

    it('handles ssh:// URLs', () => {
      expect(normalizeRepoUrl('ssh://git@github.com/owner/repo.git')).toBe(
        'https://github.com/owner/repo',
      );
    });

    it('handles undefined or empty string', () => {
      expect(normalizeRepoUrl(undefined)).toBeUndefined();
      expect(normalizeRepoUrl('')).toBeUndefined();
    });
  });

  describe('git repo operations on fixture repo', () => {
    it('detects git repo correctly', async () => {
      repo = await createTestRepo();
      expect(await isGitRepo(repo.dir)).toBe(true);
    });

    it('returns empty tags and null latest tag on repo with no tags', async () => {
      repo = await createTestRepo();
      await repo.commit('feat: initial commit');

      const latest = await getLatestSemverTag(repo.dir);
      expect(latest).toBeNull();
    });

    it('extracts latest semver tag respecting semver ordering', async () => {
      repo = await createTestRepo();
      await repo.commit('feat: one');
      await repo.tag('v1.0.0');

      await repo.commit('feat: two');
      await repo.tag('v1.2.0');

      await repo.commit('feat: three');
      await repo.tag('v1.1.5');

      await repo.commit('chore: bad tag');
      await repo.tag('not-semver');

      const warnings: string[] = [];
      const latest = await getLatestSemverTag(repo.dir, 'v', undefined, (w) => warnings.push(w));

      expect(latest).toEqual({ tag: 'v1.2.0', version: '1.2.0' });
      expect(warnings).toContain('Ignoring non-semver tag: "not-semver"');
    });

    it('extracts latest tag for monorepo package', async () => {
      repo = await createTestRepo();
      await repo.commit('feat: root commit');
      await repo.tag('v1.0.0');

      await repo.commit('feat(core): core change');
      await repo.tag('core@1.5.0');

      await repo.commit('feat(core): another core change');
      await repo.tag('core@1.4.0');

      const latest = await getLatestSemverTag(repo.dir, 'v', 'core');
      expect(latest).toEqual({ tag: 'core@1.5.0', version: '1.5.0' });
    });

    it('retrieves commits in range and scopes to packagePath', async () => {
      repo = await createTestRepo();
      await repo.commit('feat: commit 1', { 'root.txt': 'root' });
      await repo.tag('v1.0.0');

      await repo.commit('feat(pkg): package change', {
        'packages/core/index.ts': 'export const a = 1;',
      });
      await repo.commit('feat(docs): doc update', { 'docs/readme.md': 'docs' });

      // Range from v1.0.0 to HEAD
      const allCommits = await getCommits({ cwd: repo.dir, from: 'v1.0.0' });
      expect(allCommits).toHaveLength(2);

      // Scoped to packagePath
      const pkgCommits = await getCommits({
        cwd: repo.dir,
        from: 'v1.0.0',
        packagePath: 'packages/core',
      });
      expect(pkgCommits).toHaveLength(1);
      expect(pkgCommits[0]?.raw).toContain('feat(pkg): package change');
    });
  });
});
