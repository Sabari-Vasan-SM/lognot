import { describe, it, expect } from 'vitest';
import { calculateNextVersion, determineBumpType } from '../src/version.js';
import type { ParsedCommit } from '../src/types.js';

describe('version.ts', () => {
  const mockCommit = (type: string | null, isBreaking = false): ParsedCommit => ({
    sha: '1234567890abcdef',
    shortSha: '1234567',
    header: `${type}: something`,
    type,
    scope: null,
    subject: 'something',
    body: null,
    footer: null,
    isBreaking,
    references: [],
    authorName: 'Dev',
    authorEmail: 'dev@test.com',
    date: '2026-10-11T10:00:00Z',
    raw: `${type}: something`,
    isMerge: false,
  });

  describe('determineBumpType', () => {
    it('returns major if any commit is breaking', () => {
      const commits = [mockCommit('fix'), mockCommit('feat', true)];
      expect(determineBumpType(commits)).toBe('major');
    });

    it('returns minor if there is a feat commit and no breaking changes', () => {
      const commits = [mockCommit('fix'), mockCommit('feat')];
      expect(determineBumpType(commits)).toBe('minor');
    });

    it('returns patch if there is a fix, perf, or security commit', () => {
      expect(determineBumpType([mockCommit('fix')])).toBe('patch');
      expect(determineBumpType([mockCommit('perf')])).toBe('patch');
      expect(determineBumpType([mockCommit('security')])).toBe('patch');
    });

    it('returns null if there are only chore, docs, or other non-bumping commits', () => {
      expect(determineBumpType([mockCommit('docs')])).toBeNull();
      expect(determineBumpType([mockCommit('chore')])).toBeNull();
      expect(determineBumpType([mockCommit('ci')])).toBeNull();
    });
  });

  describe('calculateNextVersion', () => {
    it('defaults to 0.1.0 when no previous tags exist', () => {
      const res = calculateNextVersion(null, 'auto', [mockCommit('feat')]);
      expect(res.version).toBe('0.1.0');
      expect(res.isInitial).toBe(true);
      expect(res.previousVersion).toBeNull();
    });

    it('strips "v" prefix from current tag and calculates next version', () => {
      const res = calculateNextVersion('v1.2.3', 'auto', [mockCommit('feat')]);
      expect(res.version).toBe('1.3.0');
      expect(res.previousVersion).toBe('1.2.3');
      expect(res.bumpType).toBe('minor');
    });

    it('handles breaking change bump from v1.2.3 to 2.0.0', () => {
      const res = calculateNextVersion('1.2.3', 'auto', [mockCommit('feat', true)]);
      expect(res.version).toBe('2.0.0');
      expect(res.bumpType).toBe('major');
    });

    it('handles patch bump from v1.2.3 to 1.2.4', () => {
      const res = calculateNextVersion('v1.2.3', 'auto', [mockCommit('fix')]);
      expect(res.version).toBe('1.2.4');
      expect(res.bumpType).toBe('patch');
    });

    it('returns current version and null bumpType when no bump is warranted', () => {
      const res = calculateNextVersion('v1.2.3', 'auto', [mockCommit('docs')]);
      expect(res.version).toBe('1.2.3');
      expect(res.bumpType).toBeNull();
    });

    it('handles explicit bump argument', () => {
      const res = calculateNextVersion('v1.2.3', 'major', []);
      expect(res.version).toBe('2.0.0');
      expect(res.bumpType).toBe('major');
    });

    it('handles forced version correctly', () => {
      const res = calculateNextVersion('v1.2.3', 'auto', [], '2.5.0');
      expect(res.version).toBe('2.5.0');
    });

    it('throws error for invalid forced version', () => {
      expect(() => calculateNextVersion('v1.2.3', 'auto', [], 'not-a-version')).toThrow(
        /Invalid forced version/,
      );
    });

    it('handles pre-release base version bumping', () => {
      const res = calculateNextVersion('v1.2.0-beta.1', 'patch', []);
      expect(res.version).toBe('1.2.0');
    });
  });
});
