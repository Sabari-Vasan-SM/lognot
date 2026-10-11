import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getGithubToken, resolveOwnerAndRepo, createOrUpdateRelease } from '../src/github.js';
import type { Octokit } from '@octokit/rest';

describe('github.ts', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.LOGNOT_GITHUB_TOKEN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws error when no GitHub token is set in environment', () => {
    expect(() => getGithubToken()).toThrow(/GitHub token missing/);
  });

  it('reads token from GITHUB_TOKEN or LOGNOT_GITHUB_TOKEN', () => {
    process.env.GITHUB_TOKEN = 'gh_test_123';
    expect(getGithubToken()).toBe('gh_test_123');

    delete process.env.GITHUB_TOKEN;
    process.env.LOGNOT_GITHUB_TOKEN = 'lognot_gh_456';
    expect(getGithubToken()).toBe('lognot_gh_456');
  });

  it('resolves owner and repo from config or repoUrl', () => {
    const fromConfig = resolveOwnerAndRepo(undefined, { owner: 'my-org', repo: 'my-project' });
    expect(fromConfig).toEqual({ owner: 'my-org', repo: 'my-project' });

    const fromHttps = resolveOwnerAndRepo('https://github.com/facebook/react');
    expect(fromHttps).toEqual({ owner: 'facebook', repo: 'react' });

    const fromGit = resolveOwnerAndRepo('https://github.com/vuejs/core.git');
    expect(fromGit).toEqual({ owner: 'vuejs', repo: 'core' });

    expect(() => resolveOwnerAndRepo(undefined, undefined)).toThrow(/Could not determine/);
  });

  it('creates new release when release does not exist', async () => {
    process.env.GITHUB_TOKEN = 'token';
    const mockOctokit = {
      rest: {
        repos: {
          getReleaseByTag: vi.fn().mockRejectedValue({ status: 404 }),
          createRelease: vi.fn().mockResolvedValue({
            data: { id: 101, html_url: 'https://github.com/org/repo/releases/tag/v1.0.0' },
          }),
          updateRelease: vi.fn(),
        },
      },
    } as unknown as Octokit;

    const result = await createOrUpdateRelease(
      {
        tag: 'v1.0.0',
        body: 'Release notes',
        repoUrl: 'https://github.com/org/repo',
      },
      mockOctokit,
    );

    expect(result.action).toBe('created');
    expect(result.id).toBe(101);
  });

  it('updates existing release when tag already has a release', async () => {
    process.env.GITHUB_TOKEN = 'token';
    const mockOctokit = {
      rest: {
        repos: {
          getReleaseByTag: vi.fn().mockResolvedValue({ data: { id: 202 } }),
          updateRelease: vi.fn().mockResolvedValue({
            data: { id: 202, html_url: 'https://github.com/org/repo/releases/tag/v1.0.0' },
          }),
          createRelease: vi.fn(),
        },
      },
    } as unknown as Octokit;

    const result = await createOrUpdateRelease(
      {
        tag: 'v1.0.0',
        body: 'Updated release notes',
        repoUrl: 'https://github.com/org/repo',
      },
      mockOctokit,
    );

    expect(result.action).toBe('updated');
    expect(result.id).toBe(202);
  });
});
