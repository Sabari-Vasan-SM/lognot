import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';
import { createTestRepo, TestRepo } from './fixtures/git-repo.js';

const CLI_BIN = path.resolve(__dirname, '../dist/cli.js');

describe('CLI End-to-End Tests', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
  });

  afterEach(async () => {
    await repo.cleanup();
  });

  const runCli = (args: string[], options: { cwd?: string; env?: Record<string, string> } = {}) => {
    return execa('node', [CLI_BIN, ...args], {
      cwd: options.cwd ?? repo.dir,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test Author',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test Committer',
        GIT_COMMITTER_EMAIL: 'committer@example.com',
        NO_COLOR: '1',
        ...options.env,
      },
      reject: false,
    });
  };

  it('exits with code 2 when executed outside of a git repository', async () => {
    const tempNonGit = await fs.mkdtemp(path.join(repo.dir, '../non-git-'));
    try {
      const res = await runCli([], { cwd: tempNonGit });
      expect(res.exitCode).toBe(2);
      expect(res.stderr).toContain('not a git repository');
    } finally {
      await fs.rm(tempNonGit, { recursive: true, force: true });
    }
  });

  it('prints friendly message and exits 0 when range has no commits', async () => {
    await repo.commit('feat: initial commit');
    await repo.tag('v1.0.0');

    // Range v1.0.0..HEAD has 0 new commits
    const res = await runCli(['--from', 'v1.0.0', '--to', 'HEAD']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('No commits found in range');
  });

  it('runs --dry-run, outputs markdown to stdout, does not write file', async () => {
    await repo.commit('feat(auth): add biometric authentication');
    await repo.commit('fix(api): fix timeout error #42');

    const res = await runCli(['--dry-run']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('## [0.1.0]');
    expect(res.stdout).toContain('### ✨ Features');
    expect(res.stdout).toContain('#### auth');
    expect(res.stdout).toContain('add biometric authentication');
    expect(res.stdout).toContain('### 🐛 Bug Fixes');
    expect(res.stdout).toContain('fix timeout error #42');

    // File should not have been created
    const exists = await fs
      .access(path.join(repo.dir, 'CHANGELOG.md'))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
  });

  it('writes CHANGELOG.md on standard execution', async () => {
    await repo.commit('feat: first feature');

    const res = await runCli([]);
    expect(res.exitCode).toBe(0);

    const changelogPath = path.join(repo.dir, 'CHANGELOG.md');
    const content = await fs.readFile(changelogPath, 'utf8');
    expect(content).toContain('# Changelog');
    expect(content).toContain('## [0.1.0]');
    expect(content).toContain('### ✨ Features');
    expect(content).toContain('first feature');
  });

  it('fails with exit 1 if version already exists in CHANGELOG.md without --force', async () => {
    await repo.commit('feat: first feature');
    await runCli([]);

    // Attempting to run again for the same 0.1.0 version without force
    const duplicateRes = await runCli([]);
    expect(duplicateRes.exitCode).toBe(1);
    expect(duplicateRes.stderr).toContain('already exists');

    // Succeeds with --force
    const forceRes = await runCli(['--force']);
    expect(forceRes.exitCode).toBe(0);
  });

  it('bumps minor from v1.0.0 when new feat commit is present', async () => {
    await repo.commit('chore: initial');
    await repo.tag('v1.0.0');

    await repo.commit('feat: shiny new feature');

    const res = await runCli(['--dry-run']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('## [1.1.0]');
  });

  it('bumps major from v1.0.0 when breaking change is present', async () => {
    await repo.commit('chore: initial');
    await repo.tag('v1.0.0');

    await repo.commit('feat!: complete architecture overhaul');

    const res = await runCli(['--dry-run']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('## [2.0.0]');
    expect(res.stdout).toContain('### 💥 Breaking Changes');
  });

  it('respects forced version flag --version 3.4.5', async () => {
    await repo.commit('fix: minor bug');

    const res = await runCli(['--dry-run', '--version', '3.4.5']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('## [3.4.5]');
  });

  it('validates commits with "check" command', async () => {
    await repo.commit('feat: valid conventional commit');

    const checkPass = await runCli(['check']);
    expect(checkPass.exitCode).toBe(0);
    expect(checkPass.stdout).toContain('All 1 commits in range follow Conventional Commits');

    await repo.commit('this is a completely invalid commit message');
    const checkFail = await runCli(['check']);
    expect(checkFail.exitCode).toBe(1);
    expect(checkFail.stderr).toContain('Validation failed: 1 invalid commit(s) found');
  });

  it('creates configuration file with "init" command', async () => {
    const initRes = await runCli(['init']);
    expect(initRes.exitCode).toBe(0);

    const configPath = path.join(repo.dir, 'lognot.config.json');
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.output).toBe('CHANGELOG.md');

    // Running init again without force fails
    const secondInit = await runCli(['init']);
    expect(secondInit.exitCode).toBe(1);
    expect(secondInit.stderr).toContain('already exists');

    // Succeeds with --force
    const forceInit = await runCli(['init', '--force']);
    expect(forceInit.exitCode).toBe(0);
  });

  it('outputs JSON when --json is provided', async () => {
    await repo.commit('feat: json test feature');

    const res = await runCli(['--dry-run', '--json']);
    expect(res.exitCode).toBe(0);

    const data = JSON.parse(res.stdout);
    expect(data.version).toBe('0.1.0');
    expect(data.dryRun).toBe(true);
    expect(data.markdown).toContain('json test feature');
  });

  it('supports monorepo --package scoping', async () => {
    // Write config with package
    const config = {
      packages: {
        core: {
          path: 'packages/core',
          output: 'packages/core/CHANGELOG.md',
        },
      },
    };
    await fs.writeFile(path.join(repo.dir, 'lognot.config.json'), JSON.stringify(config), 'utf8');

    await repo.commit('feat(core): core feature', {
      'packages/core/index.js': 'console.log("core");',
    });
    await repo.commit('feat(web): web feature', {
      'packages/web/index.js': 'console.log("web");',
    });

    const res = await runCli(['--package', 'core', '--dry-run']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('core feature');
    expect(res.stdout).not.toContain('web feature');
  });
});
