import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { validateConfig, mergeConfig, loadConfig, DEFAULT_CONFIG } from '../src/config.js';

describe('config.ts', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lognot-config-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('validates and returns default config for empty object', () => {
    const config = validateConfig({});
    expect(config.output).toBe(DEFAULT_CONFIG.output);
    expect(config.format).toBe(DEFAULT_CONFIG.format);
    expect(config.bump).toBe(DEFAULT_CONFIG.bump);
    expect(config.sections.feat?.title).toBe('Features');
  });

  it('merges custom sections over default sections without losing others', () => {
    const config = mergeConfig({
      sections: {
        feat: { title: 'New Features', emoji: '🚀' },
      },
    });

    expect(config.sections.feat?.title).toBe('New Features');
    expect(config.sections.feat?.emoji).toBe('🚀');
    // Still preserves fix
    expect(config.sections.fix?.title).toBe('Bug Fixes');
  });

  it('throws descriptive error on invalid format', () => {
    expect(() =>
      validateConfig({
        // @ts-expect-error testing invalid input
        format: 'invalid_format',
      }),
    ).toThrow(/Invalid configuration:\s+- format:/);
  });

  it('throws descriptive error on invalid bump strategy', () => {
    expect(() =>
      validateConfig({
        // @ts-expect-error testing invalid input
        bump: 'ultra',
      }),
    ).toThrow(/Invalid configuration:\s+- bump:/);
  });

  it('throws error when a section title is empty', () => {
    expect(() =>
      validateConfig({
        sections: {
          feat: { title: '', emoji: '✨' },
        },
      }),
    ).toThrow(/sections\.feat\.title: Section title must not be empty/);
  });

  it('loads config from lognot.config.json file via cosmiconfig', async () => {
    const customConfig = {
      output: 'CHANGELOG_CUSTOM.md',
      tagPrefix: 'custom-v',
      bump: 'minor',
    };
    await fs.writeFile(
      path.join(tmpDir, 'lognot.config.json'),
      JSON.stringify(customConfig),
      'utf8',
    );

    const { config, filepath } = await loadConfig(tmpDir);
    expect(filepath).toContain('lognot.config.json');
    expect(config.output).toBe('CHANGELOG_CUSTOM.md');
    expect(config.tagPrefix).toBe('custom-v');
    expect(config.bump).toBe('minor');
  });

  it('loads config from package.json "lognot" field', async () => {
    const pkg = {
      name: 'my-pkg',
      lognot: {
        output: 'HISTORY.md',
      },
    };
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkg), 'utf8');

    const { config, filepath } = await loadConfig(tmpDir);
    expect(filepath).toContain('package.json');
    expect(config.output).toBe('HISTORY.md');
  });
});
