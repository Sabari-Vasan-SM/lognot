import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { writeChangelog, hasVersion, detectLineEnding, mergeChangelog } from '../src/writer.js';

describe('writer.ts', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lognot-writer-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('detects line endings correctly', () => {
    expect(detectLineEnding('line 1\r\nline 2\r\n')).toBe('\r\n');
    expect(detectLineEnding('line 1\nline 2\n')).toBe('\n');
  });

  it('detects existing version headers', () => {
    const text = '## [1.2.0] - 2026-10-10\n- feature';
    expect(hasVersion(text, '1.2.0')).toBe(true);
    expect(hasVersion(text, 'v1.2.0')).toBe(true);
    expect(hasVersion(text, '1.3.0')).toBe(false);
  });

  it('merges new entry before previous version entries', () => {
    const existing = `# Changelog\n\nIntro text\n\n## [1.0.0] - 2026-01-01\n- Initial release\n`;
    const newEntry = `## [1.1.0] - 2026-02-01\n\n### ✨ Features\n- New feature`;
    const merged = mergeChangelog(existing, newEntry, '\n');

    expect(merged).toContain('# Changelog\n\nIntro text\n\n## [1.1.0]');
    expect(merged).toContain('## [1.0.0] - 2026-01-01');
    const index110 = merged.indexOf('## [1.1.0]');
    const index100 = merged.indexOf('## [1.0.0]');
    expect(index110).toBeLessThan(index100);
  });

  it('creates new file with header when file does not exist', async () => {
    const changelogPath = path.join(tmpDir, 'CHANGELOG.md');
    const entry = '## [0.1.0] - 2026-10-11\n\n### ✨ Features\n- Initial feature';

    await writeChangelog({
      filePath: changelogPath,
      newEntry: entry,
      version: '0.1.0',
    });

    const content = await fs.readFile(changelogPath, 'utf8');
    expect(content).toContain('# Changelog');
    expect(content).toContain('Keep a Changelog');
    expect(content).toContain('## [0.1.0] - 2026-10-11');
  });

  it('fails with duplicate version when force is false', async () => {
    const changelogPath = path.join(tmpDir, 'CHANGELOG.md');
    const entry = '## [1.0.0] - 2026-10-11\n- feature';

    await writeChangelog({
      filePath: changelogPath,
      newEntry: entry,
      version: '1.0.0',
    });

    await expect(
      writeChangelog({
        filePath: changelogPath,
        newEntry: entry,
        version: '1.0.0',
        force: false,
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('allows duplicate version when force is true', async () => {
    const changelogPath = path.join(tmpDir, 'CHANGELOG.md');
    const entry = '## [1.0.0] - 2026-10-11\n- feature';

    await writeChangelog({
      filePath: changelogPath,
      newEntry: entry,
      version: '1.0.0',
    });

    await expect(
      writeChangelog({
        filePath: changelogPath,
        newEntry: entry,
        version: '1.0.0',
        force: true,
      }),
    ).resolves.not.toThrow();
  });

  it('preserves CRLF line endings in existing file', async () => {
    const changelogPath = path.join(tmpDir, 'CHANGELOG.md');
    const existing = '# Changelog\r\n\r\n## [1.0.0] - 2026-01-01\r\n- Initial\r\n';
    await fs.writeFile(changelogPath, existing, 'utf8');

    const newEntry = '## [1.1.0] - 2026-02-01\n\n### ✨ Features\n- Feature';
    await writeChangelog({
      filePath: changelogPath,
      newEntry,
      version: '1.1.0',
    });

    const content = await fs.readFile(changelogPath, 'utf8');
    expect(content).toContain('\r\n');
    expect(content.includes('\r\n## [1.1.0]')).toBe(true);
  });

  it('cleans up .bak file on success', async () => {
    const changelogPath = path.join(tmpDir, 'CHANGELOG.md');
    await fs.writeFile(changelogPath, '# Changelog\n', 'utf8');

    await writeChangelog({
      filePath: changelogPath,
      newEntry: '## [0.1.0] - 2026-10-11\n- Test',
      version: '0.1.0',
    });

    const files = await fs.readdir(tmpDir);
    expect(files).toContain('CHANGELOG.md');
    expect(files).not.toContain('CHANGELOG.md.bak');
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
  });
});
