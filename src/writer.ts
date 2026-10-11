import { promises as fs } from 'node:fs';
import path from 'node:path';
import { KEEP_A_CHANGELOG_HEADER } from './render.js';

export interface WriteChangelogOptions {
  filePath: string;
  newEntry: string;
  version: string;
  force?: boolean;
}

/**
 * Escapes characters for use in regular expressions.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detects whether content primarily uses Windows (\r\n) or POSIX (\n) line endings.
 */
export function detectLineEnding(content: string): '\r\n' | '\n' {
  const crlfCount = (content.match(/\r\n/g) || []).length;
  const lfCount = (content.match(/[^\r]\n/g) || []).length;
  return crlfCount > lfCount ? '\r\n' : '\n';
}

/**
 * Checks if a version header already exists in the given changelog content.
 */
export function hasVersion(content: string, version: string): boolean {
  const cleanVer = version.replace(/^v/, '');
  const pattern = new RegExp(`^##\\s*\\[?v?${escapeRegex(cleanVer)}\\]?`, 'm');
  return pattern.test(content);
}

/**
 * Merges a new changelog entry into existing changelog text, preserving headers and line endings.
 */
export function mergeChangelog(
  existingContent: string,
  newEntry: string,
  eol: '\r\n' | '\n' = '\n',
): string {
  const normalizedExisting = existingContent.replace(/\r\n/g, '\n');
  const normalizedNewEntry = newEntry.replace(/\r\n/g, '\n').trim();

  // Look for the first release header `## `
  const firstSectionIndex = normalizedExisting.search(/^##\s+/m);

  let merged: string;

  if (firstSectionIndex !== -1) {
    // There is an existing ## release section
    const preamble = normalizedExisting.slice(0, firstSectionIndex).trimEnd();
    const rest = normalizedExisting.slice(firstSectionIndex).trimStart();
    if (preamble.length > 0) {
      merged = `${preamble}\n\n${normalizedNewEntry}\n\n${rest}`;
    } else {
      merged = `${normalizedNewEntry}\n\n${rest}`;
    }
  } else {
    // No ## section found
    const trimmed = normalizedExisting.trim();
    if (trimmed.length > 0) {
      merged = `${trimmed}\n\n${normalizedNewEntry}\n`;
    } else {
      merged = `${normalizedNewEntry}\n`;
    }
  }

  // Ensure trailing newline and proper line endings
  merged = merged.trim() + '\n';
  if (eol === '\r\n') {
    merged = merged.replace(/\n/g, '\r\n');
  }

  return merged;
}

/**
 * Atomically writes or prepends a new changelog entry to the target file.
 * Creates a .bak backup during write and cleans it up upon success.
 *
 * @param options Write options
 * @throws Error if version already exists without force flag, or on filesystem error
 */
export async function writeChangelog(options: WriteChangelogOptions): Promise<void> {
  const { filePath, newEntry, version, force = false } = options;
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const dir = path.dirname(resolvedPath);

  await fs.mkdir(dir, { recursive: true });

  let fileExists = false;
  let existingContent = '';

  try {
    existingContent = await fs.readFile(resolvedPath, 'utf8');
    fileExists = true;
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  if (fileExists && !force && hasVersion(existingContent, version)) {
    throw new Error(
      `Version "${version}" already exists in ${path.relative(process.cwd(), resolvedPath)}. Use --force to proceed anyway.`,
    );
  }

  const eol = fileExists ? detectLineEnding(existingContent) : '\n';
  let finalContent: string;

  if (fileExists) {
    finalContent = mergeChangelog(existingContent, newEntry, eol);
  } else {
    // New file: prepend Keep a Changelog header
    const initial = `${KEEP_A_CHANGELOG_HEADER}\n${newEntry.trim()}\n`;
    finalContent = eol === '\r\n' ? initial.replace(/\n/g, '\r\n') : initial;
  }

  const backupPath = `${resolvedPath}.bak`;
  const tempPath = `${resolvedPath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;

  // Step 1: Create backup if file exists
  if (fileExists) {
    await fs.copyFile(resolvedPath, backupPath);
  }

  try {
    // Step 2: Write to temp file in same directory
    await fs.writeFile(tempPath, finalContent, 'utf8');

    // Step 3: Atomic rename
    await fs.rename(tempPath, resolvedPath);

    // Step 4: Remove backup on success
    if (fileExists) {
      await fs.unlink(backupPath).catch(() => {});
    }
  } catch (error) {
    // Cleanup temp file
    await fs.unlink(tempPath).catch(() => {});

    // Restore backup if original was corrupted
    if (fileExists) {
      await fs.copyFile(backupPath, resolvedPath).catch(() => {});
    }
    throw error;
  }
}
