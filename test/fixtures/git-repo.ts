import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simpleGit, SimpleGit } from 'simple-git';

export interface TestRepo {
  dir: string;
  git: SimpleGit;
  commit: (message: string, files?: Record<string, string>) => Promise<string>;
  tag: (tagName: string) => Promise<void>;
  cleanup: () => Promise<void>;
}

/**
 * Creates an isolated temporary git repository with sanitized author/committer configs.
 */
export async function createTestRepo(namePrefix = 'lognot-test-'): Promise<TestRepo> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), namePrefix));
  const git = simpleGit({
    baseDir: dir,
  });

  await git.init();
  await git.addConfig('user.name', 'Test Author');
  await git.addConfig('user.email', 'test@example.com');
  await git.addConfig('commit.gpgsign', 'false');
  await git.addConfig('core.autocrlf', 'false');

  let fileIndex = 0;

  const commit = async (message: string, files?: Record<string, string>): Promise<string> => {
    if (files && Object.keys(files).length > 0) {
      for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(dir, filePath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content, 'utf8');
        await git.add(filePath);
      }
    } else {
      fileIndex += 1;
      const dummyFile = `file-${fileIndex}.txt`;
      await fs.writeFile(path.join(dir, dummyFile), `Dummy content ${fileIndex}\n`, 'utf8');
      await git.add(dummyFile);
    }

    const result = await git.commit(message, undefined, {
      '--author': 'Test Author <test@example.com>',
    });
    return result.commit;
  };

  const tag = async (tagName: string): Promise<void> => {
    await git.addTag(tagName);
  };

  const cleanup = async (): Promise<void> => {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error if already removed
    }
  };

  return {
    dir,
    git,
    commit,
    tag,
    cleanup,
  };
}
