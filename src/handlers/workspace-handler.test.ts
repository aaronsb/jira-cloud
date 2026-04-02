import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as workspace from '../workspace/index.js';
import { handleWorkspaceRequest } from './workspace-handler.js';

// Mock workspace module
vi.mock('../workspace/index.js', () => ({
  ensureWorkspaceDir: vi.fn().mockResolvedValue({ path: '/mock/workspace', valid: true }),
  resolveWorkspacePath: vi.fn((f: string) => `/mock/workspace/${f}`),
  ensureParentDir: vi.fn().mockResolvedValue(undefined),
  verifyPathSafety: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('node:fs/promises');

describe('workspace-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(workspace.ensureWorkspaceDir).mockResolvedValue({ path: '/mock/workspace', valid: true });
  });

  describe('list', () => {
    it('shows empty workspace', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([]);
      const result = await handleWorkspaceRequest({ operation: 'list' });
      expect(result.content[0].text).toContain('empty');
      expect(result.content[0].text).toContain('/mock/workspace');
    });

    it('fails when workspace is invalid', async () => {
      vi.mocked(workspace.ensureWorkspaceDir).mockResolvedValueOnce({ path: '/bad', valid: false, warning: 'forbidden path' });
      const result = await handleWorkspaceRequest({ operation: 'list' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Workspace invalid');
    });
  });

  describe('read', () => {
    it('requires filename', async () => {
      const result = await handleWorkspaceRequest({ operation: 'read' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('filename is required');
    });

    it('returns error for missing file', async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));
      const result = await handleWorkspaceRequest({ operation: 'read', filename: 'missing.txt' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('File not found');
    });

    it('inlines small text files', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ size: 100 });
      vi.mocked(fs.readFile).mockResolvedValue('hello world');
      const result = await handleWorkspaceRequest({ operation: 'read', filename: 'notes.txt' });
      expect(result.content[0].text).toContain('hello world');
      expect(result.content[0].text).toContain('notes.txt');
    });

    it('inlines small images', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ size: 1024 });
      vi.mocked(fs.readFile).mockResolvedValue(Buffer.from('fake png'));
      const result = await handleWorkspaceRequest({ operation: 'read', filename: 'photo.png' });
      expect(result.content).toHaveLength(2);
      expect(result.content[1].type).toBe('image');
      expect(result.content[1].mimeType).toBe('image/png');
    });

    it('returns path reference for binary files', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ size: 2048 });
      const result = await handleWorkspaceRequest({ operation: 'read', filename: 'archive.zip' });
      expect(result.content[0].text).toContain('binary');
      expect(result.content[0].text).toContain('manage_jira_media upload');
    });
  });

  describe('write', () => {
    it('requires filename', async () => {
      const result = await handleWorkspaceRequest({ operation: 'write', content: 'abc' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('filename is required');
    });

    it('requires content', async () => {
      const result = await handleWorkspaceRequest({ operation: 'write', filename: 'test.txt' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('content (base64-encoded) is required');
    });

    it('writes base64 content to workspace', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      const b64 = Buffer.from('hello').toString('base64');
      const result = await handleWorkspaceRequest({ operation: 'write', filename: 'test.txt', content: b64 });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Written: test.txt');
      expect(vi.mocked(fs.writeFile)).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('requires filename', async () => {
      const result = await handleWorkspaceRequest({ operation: 'delete' });
      expect(result.isError).toBe(true);
    });

    it('deletes files and confirms local-only', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => false });
      vi.mocked(fs.unlink).mockResolvedValue(undefined);
      const result = await handleWorkspaceRequest({ operation: 'delete', filename: 'test.txt' });
      expect(result.content[0].text).toContain('Deleted local file');
      expect(result.content[0].text).toContain('Jira attachments unaffected');
    });

    it('recursively deletes directories and confirms local-only', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true });
      vi.mocked(fs.rm).mockResolvedValue(undefined);
      const result = await handleWorkspaceRequest({ operation: 'delete', filename: 'subdir' });
      expect(result.content[0].text).toContain('Deleted local directory');
      expect(result.content[0].text).toContain('Jira attachments unaffected');
    });

    it('returns error for missing file', async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));
      const result = await handleWorkspaceRequest({ operation: 'delete', filename: 'ghost.txt' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('File not found');
    });
  });

  describe('mkdir', () => {
    it('requires filename', async () => {
      const result = await handleWorkspaceRequest({ operation: 'mkdir' });
      expect(result.isError).toBe(true);
    });

    it('creates directory', async () => {
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      const result = await handleWorkspaceRequest({ operation: 'mkdir', filename: 'subdir' });
      expect(result.content[0].text).toContain('Created: subdir/');
    });
  });

  describe('move', () => {
    it('requires filename', async () => {
      const result = await handleWorkspaceRequest({ operation: 'move', destination: 'b.txt' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('filename');
    });

    it('requires destination', async () => {
      const result = await handleWorkspaceRequest({ operation: 'move', filename: 'a.txt' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('destination');
    });

    it('moves files', async () => {
      vi.mocked(fs.stat).mockResolvedValue({ size: 100 });
      vi.mocked(fs.rename).mockResolvedValue(undefined);
      const result = await handleWorkspaceRequest({ operation: 'move', filename: 'a.txt', destination: 'b.txt' });
      expect(result.content[0].text).toContain('Moved: a.txt');
      expect(result.content[0].text).toContain('b.txt');
    });

    it('returns error for missing source', async () => {
      vi.mocked(fs.stat).mockRejectedValue(new Error('ENOENT'));
      const result = await handleWorkspaceRequest({ operation: 'move', filename: 'ghost.txt', destination: 'b.txt' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Source not found');
    });
  });

  it('rejects unknown operations', async () => {
    const result = await handleWorkspaceRequest({ operation: 'explode' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown workspace operation');
  });
});
