import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMediaRequest } from './media-handler.js';

// Mock workspace module to avoid filesystem side effects
vi.mock('../workspace/index.js', () => ({
  ensureWorkspaceDir: vi.fn().mockResolvedValue({ path: '/mock/workspace', valid: true }),
  formatSize: (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  },
  resolveWorkspacePath: vi.fn((f: string) => `/mock/workspace/${f}`),
  ensureParentDir: vi.fn().mockResolvedValue(undefined),
  verifyPathSafety: vi.fn().mockResolvedValue(undefined),
  sanitizeFilename: vi.fn((f: string) => f),
}));

// Mock fs to avoid real filesystem operations
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('fake content')),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

function mockClient(overrides: Record<string, any> = {}) {
  return {
    getIssueAttachments: overrides.getIssueAttachments ?? vi.fn().mockResolvedValue([
      { id: '100', filename: 'test.png', mimeType: 'image/png', size: 1024, created: '2026-01-01', author: 'Test User', url: '' },
      { id: '101', filename: 'doc.pdf', mimeType: 'application/pdf', size: 2048, created: '2026-01-02', author: 'Test User', url: '' },
    ]),
    getAttachmentInfo: overrides.getAttachmentInfo ?? vi.fn().mockResolvedValue(
      { id: '100', filename: 'test.png', mimeType: 'image/png', size: 1024, created: '2026-01-01', author: 'Test User', url: '' },
    ),
    downloadAttachment: overrides.downloadAttachment ?? vi.fn().mockResolvedValue(Buffer.from('fake image bytes')),
    uploadAttachment: overrides.uploadAttachment ?? vi.fn().mockResolvedValue(
      { id: '200', filename: 'uploaded.png', mimeType: 'image/png', size: 512, created: '2026-01-03', author: 'Test User', url: '' },
    ),
    deleteAttachment: overrides.deleteAttachment ?? vi.fn().mockResolvedValue(undefined),
  } as any;
}

describe('media-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('requires issueKey', async () => {
      const result = await handleMediaRequest(mockClient(), { operation: 'list' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('issueKey is required');
    });

    it('lists attachments on an issue', async () => {
      const result = await handleMediaRequest(mockClient(), { operation: 'list', issueKey: 'PROJ-1' });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('test.png');
      expect(result.content[0].text).toContain('doc.pdf');
      expect(result.content[0].text).toContain('Attachments on PROJ-1 (2)');
    });

    it('reports empty attachments', async () => {
      const client = mockClient({ getIssueAttachments: vi.fn().mockResolvedValue([]) });
      const result = await handleMediaRequest(client, { operation: 'list', issueKey: 'PROJ-1' });
      expect(result.content[0].text).toContain('No attachments');
    });
  });

  describe('upload', () => {
    it('requires issueKey, filename, and mediaType', async () => {
      const result = await handleMediaRequest(mockClient(), { operation: 'upload' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('issueKey, filename, and mediaType are required');
    });

    it('requires content or workspaceFile', async () => {
      const result = await handleMediaRequest(mockClient(), {
        operation: 'upload', issueKey: 'PROJ-1', filename: 'test.png', mediaType: 'image/png',
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Either content (base64) or workspaceFile');
    });

    it('uploads from base64 content', async () => {
      const client = mockClient();
      const result = await handleMediaRequest(client, {
        operation: 'upload', issueKey: 'PROJ-1', filename: 'test.png',
        mediaType: 'image/png', content: Buffer.from('fake').toString('base64'),
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Uploaded');
      expect(client.uploadAttachment).toHaveBeenCalledWith('PROJ-1', 'test.png', expect.any(Buffer), 'image/png');
    });

    it('uploads from workspace file', async () => {
      const client = mockClient();
      const result = await handleMediaRequest(client, {
        operation: 'upload', issueKey: 'PROJ-1', filename: 'test.png',
        mediaType: 'image/png', workspaceFile: 'test.png',
      });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Uploaded');
    });
  });

  describe('download', () => {
    it('requires attachmentId', async () => {
      const result = await handleMediaRequest(mockClient(), { operation: 'download' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('attachmentId is required');
    });

    it('downloads to workspace', async () => {
      const result = await handleMediaRequest(mockClient(), { operation: 'download', attachmentId: '100' });
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain('Downloaded');
      expect(result.content[0].text).toContain('/mock/workspace/');
      expect(result.content[0].text).toContain('manage_workspace read');
    });

    it('respects filename override', async () => {
      const result = await handleMediaRequest(mockClient(), {
        operation: 'download', attachmentId: '100', filename: 'custom-name.png',
      });
      expect(result.content[0].text).toContain('custom-name.png');
    });

    it('fails when workspace is invalid', async () => {
      const { ensureWorkspaceDir } = await import('../workspace/index.js');
      vi.mocked(ensureWorkspaceDir).mockResolvedValueOnce({ path: '/bad', valid: false, warning: 'forbidden' });
      const result = await handleMediaRequest(mockClient(), { operation: 'download', attachmentId: '100' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Workspace invalid');
    });
  });

  describe('view', () => {
    it('requires attachmentId', async () => {
      const result = await handleMediaRequest(mockClient(), { operation: 'view' });
      expect(result.isError).toBe(true);
    });

    it('returns inline image for small images', async () => {
      const result = await handleMediaRequest(mockClient(), { operation: 'view', attachmentId: '100' });
      expect(result.content).toHaveLength(2);
      expect(result.content[0].text).toContain('test.png');
      expect(result.content[1].type).toBe('image');
      expect(result.content[1].mimeType).toBe('image/png');
    });

    it('rejects non-image files', async () => {
      const client = mockClient({
        getAttachmentInfo: vi.fn().mockResolvedValue(
          { id: '101', filename: 'doc.pdf', mimeType: 'application/pdf', size: 1024, created: '', author: '', url: '' },
        ),
      });
      const result = await handleMediaRequest(client, { operation: 'view', attachmentId: '101' });
      expect(result.content[0].text).toContain('Not an image');
      expect(result.content[0].text).toContain('download');
    });

    it('rejects oversized images', async () => {
      const client = mockClient({
        getAttachmentInfo: vi.fn().mockResolvedValue(
          { id: '100', filename: 'huge.png', mimeType: 'image/png', size: 10 * 1024 * 1024, created: '', author: '', url: '' },
        ),
      });
      const result = await handleMediaRequest(client, { operation: 'view', attachmentId: '100' });
      expect(result.content[0].text).toContain('too large');
    });
  });

  describe('get_info', () => {
    it('requires attachmentId', async () => {
      const result = await handleMediaRequest(mockClient(), { operation: 'get_info' });
      expect(result.isError).toBe(true);
    });

    it('returns attachment metadata', async () => {
      const result = await handleMediaRequest(mockClient(), { operation: 'get_info', attachmentId: '100' });
      expect(result.content[0].text).toContain('test.png');
      expect(result.content[0].text).toContain('image/png');
      expect(result.content[0].text).toContain('id:100');
    });
  });

  describe('delete', () => {
    it('requires attachmentId', async () => {
      const result = await handleMediaRequest(mockClient(), { operation: 'delete' });
      expect(result.isError).toBe(true);
    });

    it('deletes and confirms permanence', async () => {
      const client = mockClient();
      const result = await handleMediaRequest(client, { operation: 'delete', attachmentId: '100' });
      expect(result.content[0].text).toContain('Permanently deleted');
      expect(result.content[0].text).toContain('cannot be undone');
      expect(client.deleteAttachment).toHaveBeenCalledWith('100');
    });
  });

  it('rejects unknown operations', async () => {
    const result = await handleMediaRequest(mockClient(), { operation: 'explode' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unknown media operation');
  });
});
