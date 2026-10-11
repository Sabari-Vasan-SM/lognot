export interface CommitRef {
  raw: string;
  prefix: string;
  action: string | null;
  issue: string;
}

export interface RawGitCommit {
  sha: string;
  raw: string;
  authorName: string;
  authorEmail: string;
  date: string;
}

export interface ParsedCommit {
  sha: string;
  shortSha: string;
  header: string;
  type: string | null;
  scope: string | null;
  subject: string | null;
  body: string | null;
  footer: string | null;
  isBreaking: boolean;
  breakingDescription?: string;
  references: CommitRef[];
  authorName: string;
  authorEmail: string;
  date: string;
  raw: string;
  isMerge: boolean;
}

export interface SectionDef {
  title: string;
  emoji: string;
}

export interface CommitGroup {
  type: string;
  title: string;
  emoji: string;
  /**
   * Scopes mapping: '' key for unscoped commits, followed by sorted scope names
   */
  scopes: Record<string, ParsedCommit[]>;
}

export interface GroupedCommits {
  breaking: ParsedCommit[];
  groups: CommitGroup[];
  other: ParsedCommit[];
}

export type BumpType = 'major' | 'minor' | 'patch';

export interface PackageConfig {
  path: string;
  output: string;
}

export interface GithubConfig {
  owner?: string;
  repo?: string;
  draft?: boolean;
  prerelease?: boolean;
}

export interface LognotConfig {
  output: string;
  format: 'keepachangelog' | 'release';
  tagPrefix: string;
  bump: 'auto' | BumpType;
  ignoreTypes: string[];
  includeMergeCommits: boolean;
  sections: Record<string, SectionDef>;
  repoUrl?: string;
  github?: GithubConfig;
  packages?: Record<string, PackageConfig>;
}

export interface RenderOptions {
  version: string;
  date: string;
  previousVersion?: string;
  repoUrl?: string;
  format?: 'keepachangelog' | 'release';
  sections?: Record<string, SectionDef>;
}
