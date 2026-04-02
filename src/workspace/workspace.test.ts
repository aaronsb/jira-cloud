import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  sanitizeFilename,
  sanitizePath,
  resolveWorkspacePath,
  getWorkspaceDir,
  validateWorkspaceDir,
  checkWorkspaceStatus,
} from './workspace.js';

describe('sanitizeFilename', () => {
  it('passes through normal filenames', () => {
    expect(sanitizeFilename('report.pdf')).toBe('report.pdf');
    expect(sanitizeFilename('my-file_v2.txt')).toBe('my-file_v2.txt');
  });

  it('removes path separators', () => {
    expect(sanitizeFilename('foo/bar')).toBe('foo_bar');
    expect(sanitizeFilename('foo\\bar')).toBe('foo_bar');
  });

  it('removes null bytes and control characters', () => {
    expect(sanitizeFilename('file\x00name.txt')).toBe('filename.txt');
    expect(sanitizeFilename('file\x1fname.txt')).toBe('filename.txt');
  });

  it('removes dangerous characters', () => {
    expect(sanitizeFilename('file<>:"|?*.txt')).toBe('file_.txt');
  });

  it('collapses multiple underscores', () => {
    expect(sanitizeFilename('a___b')).toBe('a_b');
  });

  it('removes leading dots', () => {
    expect(sanitizeFilename('.hidden')).toBe('hidden');
    expect(sanitizeFilename('...triple')).toBe('triple');
  });

  it('removes trailing dots and spaces', () => {
    expect(sanitizeFilename('file.  ')).toBe('file');
    expect(sanitizeFilename('file...')).toBe('file');
  });

  it('returns "unnamed" for empty result', () => {
    expect(sanitizeFilename('')).toBe('unnamed');
    expect(sanitizeFilename('...')).toBe('unnamed');
    expect(sanitizeFilename('<>:"|?*')).toBe('_');
  });
});

describe('sanitizePath', () => {
  it('preserves directory structure', () => {
    expect(sanitizePath('projects/report.csv')).toMatch(/projects.report\.csv/);
  });

  it('strips traversal attempts', () => {
    const result = sanitizePath('../../../etc/passwd');
    expect(result).not.toContain('..');
    expect(result).toContain('etc');
    expect(result).toContain('passwd');
  });

  it('returns "unnamed" for empty input', () => {
    expect(sanitizePath('')).toBe('unnamed');
  });

  it('sanitizes each segment individually', () => {
    const result = sanitizePath('dir<name>/file?.txt');
    expect(result).not.toContain('<');
    expect(result).not.toContain('?');
  });
});

describe('resolveWorkspacePath', () => {
  it('resolves within workspace directory', () => {
    const result = resolveWorkspacePath('test.txt');
    expect(result).toContain(getWorkspaceDir());
    expect(result).toContain('test.txt');
  });

  it('handles nested paths', () => {
    const result = resolveWorkspacePath('sub/dir/file.txt');
    expect(result).toContain(getWorkspaceDir());
    expect(result).toContain('file.txt');
  });

  it('blocks traversal attempts', () => {
    // The sanitizer strips ".." segments, so traversal resolves inside workspace
    const result = resolveWorkspacePath('../../../etc/passwd');
    expect(result).toContain(getWorkspaceDir());
    expect(result).not.toContain('..');
  });
});

describe('validateWorkspaceDir', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('accepts a normal workspace path', () => {
    expect(() => validateWorkspaceDir('/tmp/test-workspace')).not.toThrow();
  });

  it('rejects home directory', () => {
    const home = process.env.HOME!;
    expect(() => validateWorkspaceDir(home)).toThrow('cannot be');
  });

  it('rejects filesystem root', () => {
    expect(() => validateWorkspaceDir('/')).toThrow('filesystem root');
  });

  it('rejects cloud sync paths', () => {
    expect(() => validateWorkspaceDir('/home/user/Google Drive/workspace')).toThrow('cloud sync');
    expect(() => validateWorkspaceDir('/home/user/Dropbox/workspace')).toThrow('cloud sync');
    expect(() => validateWorkspaceDir('/home/user/OneDrive/workspace')).toThrow('cloud sync');
  });

  it('accepts subdirectories of protected paths', () => {
    const home = process.env.HOME!;
    expect(() => validateWorkspaceDir(`${home}/.local/share/test`)).not.toThrow();
  });
});

describe('checkWorkspaceStatus', () => {
  it('returns valid for default workspace', () => {
    const status = checkWorkspaceStatus();
    expect(status.valid).toBe(true);
    expect(status.path).toContain('jira-cloud-mcp');
  });

  it('returns invalid with warning for bad workspace', () => {
    const originalEnv = process.env.WORKSPACE_DIR;
    process.env.WORKSPACE_DIR = process.env.HOME!;
    try {
      const status = checkWorkspaceStatus();
      expect(status.valid).toBe(false);
      expect(status.warning).toBeDefined();
    } finally {
      if (originalEnv === undefined) {
        delete process.env.WORKSPACE_DIR;
      } else {
        process.env.WORKSPACE_DIR = originalEnv;
      }
    }
  });
});

describe('getWorkspaceDir', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('respects WORKSPACE_DIR env override', () => {
    process.env.WORKSPACE_DIR = '/custom/workspace';
    expect(getWorkspaceDir()).toBe('/custom/workspace');
  });

  it('ignores WORKSPACE_DIR with unexpanded variables', () => {
    process.env.WORKSPACE_DIR = '${HOME}/workspace';
    expect(getWorkspaceDir()).not.toContain('${');
  });

  it('uses XDG_DATA_HOME when set', () => {
    delete process.env.WORKSPACE_DIR;
    process.env.XDG_DATA_HOME = '/custom/data';
    expect(getWorkspaceDir()).toBe('/custom/data/jira-cloud-mcp/workspace');
  });

  it('defaults to ~/.local/share', () => {
    delete process.env.WORKSPACE_DIR;
    delete process.env.XDG_DATA_HOME;
    expect(getWorkspaceDir()).toContain('.local/share/jira-cloud-mcp/workspace');
  });
});
