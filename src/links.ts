/**
 * Links utility to format commit SHAs and issue/PR references as markdown links.
 */

/**
 * Format a commit SHA as a markdown link or plain short SHA.
 * @param sha Full or short git commit SHA
 * @param repoUrl Optional base repository URL (e.g. https://github.com/owner/repo)
 */
export function formatCommitLink(sha: string, repoUrl?: string): string {
  const shortSha = sha.slice(0, 7);
  if (!repoUrl) {
    return shortSha;
  }
  const cleanUrl = repoUrl.replace(/\/+$/, '');
  return `[${shortSha}](${cleanUrl}/commit/${sha})`;
}

/**
 * Format an issue or PR reference as a markdown link or plain #number.
 * @param issue Issue or PR number without prefix
 * @param repoUrl Optional base repository URL
 */
export function formatIssueLink(issue: string, repoUrl?: string): string {
  if (!repoUrl) {
    return `#${issue}`;
  }
  const cleanUrl = repoUrl.replace(/\/+$/, '');
  return `[#${issue}](${cleanUrl}/issues/${issue})`;
}

/**
 * Replace plain issue references (#123) with markdown links if repoUrl is provided.
 * Does not replace if already inside a markdown link.
 * @param text Subject or description text containing issue references
 * @param repoUrl Optional base repository URL
 */
export function linkifyReferences(text: string, repoUrl?: string): string {
  if (!repoUrl) {
    return text;
  }
  const cleanUrl = repoUrl.replace(/\/+$/, '');
  // Match `#123` not preceded by `[` or followed by `]` or `)`
  return text.replace(/(?<!\[)(#(\d+))(?!\w|\]|\))/g, `[#$2](${cleanUrl}/issues/$2)`);
}
