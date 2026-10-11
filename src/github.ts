import { Octokit } from '@octokit/rest';
import type { GithubConfig } from './types.js';

export interface ReleaseParams {
  tag: string;
  name?: string;
  body: string;
  repoUrl?: string;
  githubConfig?: GithubConfig;
  draft?: boolean;
  prerelease?: boolean;
}

export interface ReleaseResult {
  id: number;
  url: string;
  tag: string;
  action: 'created' | 'updated';
}

/**
 * Retrieves GitHub token from environment variables.
 * Never accepts token via CLI flags to prevent exposure in process tables or history.
 */
export function getGithubToken(): string {
  const token = process.env.GITHUB_TOKEN || process.env.LOGNOT_GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      'GitHub token missing. Set GITHUB_TOKEN or LOGNOT_GITHUB_TOKEN environment variable.',
    );
  }
  return token;
}

/**
 * Extracts owner and repo name from GitHub configuration or repository URL.
 */
export function resolveOwnerAndRepo(
  repoUrl?: string,
  githubConfig?: GithubConfig,
): { owner: string; repo: string } {
  if (githubConfig?.owner && githubConfig?.repo) {
    return { owner: githubConfig.owner, repo: githubConfig.repo };
  }

  if (repoUrl) {
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
    if (match && match[1] && match[2]) {
      return { owner: match[1], repo: match[2] };
    }
  }

  throw new Error(
    'Could not determine GitHub owner and repository. Please configure "repoUrl" or "github.owner" and "github.repo" in lognot.config.json.',
  );
}

/**
 * Creates or updates a GitHub release for a given tag.
 *
 * @param params Release parameters
 * @param customOctokit Optional custom Octokit instance for unit testing/mocking
 */
export async function createOrUpdateRelease(
  params: ReleaseParams,
  customOctokit?: Octokit,
): Promise<ReleaseResult> {
  const token = getGithubToken();
  const { owner, repo } = resolveOwnerAndRepo(params.repoUrl, params.githubConfig);
  const octokit = customOctokit ?? new Octokit({ auth: token });

  const releaseName = params.name ?? params.tag;
  const draft = params.draft ?? params.githubConfig?.draft ?? false;
  const prerelease = params.prerelease ?? params.githubConfig?.prerelease ?? false;

  let existingReleaseId: number | null = null;

  try {
    const { data } = await octokit.rest.repos.getReleaseByTag({
      owner,
      repo,
      tag: params.tag,
    });
    existingReleaseId = data.id;
  } catch (err: unknown) {
    // 404 means release doesn't exist yet, proceed with creation
    const status = (err as { status?: number }).status;
    if (status !== 404) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to check existing GitHub release: ${msg}`);
    }
  }

  if (existingReleaseId !== null) {
    // Update existing release
    const { data } = await octokit.rest.repos.updateRelease({
      owner,
      repo,
      release_id: existingReleaseId,
      tag_name: params.tag,
      name: releaseName,
      body: params.body,
      draft,
      prerelease,
    });

    return {
      id: data.id,
      url: data.html_url,
      tag: params.tag,
      action: 'updated',
    };
  }

  // Create new release
  const { data } = await octokit.rest.repos.createRelease({
    owner,
    repo,
    tag_name: params.tag,
    name: releaseName,
    body: params.body,
    draft,
    prerelease,
  });

  return {
    id: data.id,
    url: data.html_url,
    tag: params.tag,
    action: 'created',
  };
}
