/**
 * Handler for manage_local_workspace tool.
 * See ADR-211: Attachment and Workspace Management.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  ensureWorkspaceDir,
  formatSize,
  resolveWorkspacePath,
  ensureParentDir,
  verifyPathSafety,
} from '../workspace/index.js';

interface WorkspaceArgs {
  operation: string;
  filename?: string;
  destination?: string;
  content?: string;
}

const TEXT_INLINE_LIMIT = 100 * 1024; // 100KB
const IMAGE_INLINE_LIMIT = 5 * 1024 * 1024; // 5MB

const IMAGE_EXTENSIONS: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
};

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.xml', '.csv', '.html', '.htm',
  '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.log',
  '.js', '.ts', '.py', '.rb', '.sh', '.bash', '.zsh',
  '.css', '.scss', '.less', '.svg',
]);

export async function handleWorkspaceRequest(
  args: WorkspaceArgs,
): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; isError?: boolean }> {
  switch (args.operation) {
    case 'list':
      return handleList();
    case 'read':
      return handleRead(args);
    case 'write':
      return handleWrite(args);
    case 'delete':
      return handleDelete(args);
    case 'mkdir':
      return handleMkdir(args);
    case 'move':
      return handleMove(args);
    default:
      return { content: [{ type: 'text', text: `Unknown workspace operation: ${args.operation}` }], isError: true };
  }
}

async function handleList(): Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }> {
  const status = await ensureWorkspaceDir();
  if (!status.valid) {
    return { content: [{ type: 'text', text: `Workspace invalid: ${status.warning}` }], isError: true };
  }

  const lines: string[] = [`Workspace: ${status.path}\n`];
  await listRecursive(status.path, status.path, lines, 0);

  if (lines.length === 1) {
    return { content: [{ type: 'text', text: `Workspace: ${status.path}\n\n(empty — no files staged)` }] };
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

const MAX_LIST_DEPTH = 10;

async function listRecursive(rootDir: string, dir: string, lines: string[], depth: number): Promise<void> {
  if (depth >= MAX_LIST_DEPTH) {
    lines.push(`${'  '.repeat(depth + 1)}(truncated — max depth ${MAX_LIST_DEPTH})`);
    return;
  }

  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  const indent = '  '.repeat(depth + 1);
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) continue; // skip symlinks to prevent loops
    try {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        lines.push(`${indent}${entry.name}/`);
        await listRecursive(rootDir, fullPath, lines, depth + 1);
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        lines.push(`${indent}${entry.name}  (${formatSize(stat.size)}, ${stat.mtime.toISOString().slice(0, 16)})`);
      }
    } catch {
      // Skip entries we can't stat
    }
  }
}

async function handleRead(args: WorkspaceArgs): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; isError?: boolean }> {
  if (!args.filename) {
    return { content: [{ type: 'text', text: 'filename is required for read operation' }], isError: true };
  }

  const filePath = resolveWorkspacePath(args.filename);
  await verifyPathSafety(filePath);

  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return { content: [{ type: 'text', text: `File not found in workspace: ${args.filename}` }], isError: true };
  }

  const ext = path.extname(args.filename).toLowerCase();
  const isText = TEXT_EXTENSIONS.has(ext);
  const imageMime = IMAGE_EXTENSIONS[ext];

  // Inline text
  if (isText && stat.size <= TEXT_INLINE_LIMIT) {
    const content = await fs.readFile(filePath, 'utf-8');
    return { content: [{ type: 'text', text: `File: ${args.filename} (${formatSize(stat.size)})\nPath: ${filePath}\n\n${content}` }] };
  }

  // Inline image
  if (imageMime && stat.size <= IMAGE_INLINE_LIMIT) {
    const bytes = await fs.readFile(filePath);
    return {
      content: [
        { type: 'text', text: `File: ${args.filename} | ${formatSize(stat.size)}\nPath: ${filePath}` },
        { type: 'image', data: bytes.toString('base64'), mimeType: imageMime },
      ],
    };
  }

  // Too large or unsupported — path reference only
  const label = imageMime ? 'image (too large to display inline)' : isText ? 'text' : 'binary';
  return {
    content: [{
      type: 'text',
      text: `File: ${args.filename} | ${formatSize(stat.size)} | ${label}\nPath: ${filePath}\n\nUse manage_jira_media upload with workspaceFile to upload, or manage_local_workspace delete to remove.`,
    }],
  };
}

async function handleWrite(args: WorkspaceArgs): Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }> {
  if (!args.filename) {
    return { content: [{ type: 'text', text: 'filename is required for write operation' }], isError: true };
  }
  if (!args.content) {
    return { content: [{ type: 'text', text: 'content (base64-encoded) is required for write operation' }], isError: true };
  }

  const status = await ensureWorkspaceDir();
  if (!status.valid) {
    return { content: [{ type: 'text', text: `Workspace invalid: ${status.warning}` }], isError: true };
  }

  const filePath = resolveWorkspacePath(args.filename);
  await verifyPathSafety(filePath);
  await ensureParentDir(filePath);

  const buffer = Buffer.from(args.content, 'base64');
  await fs.writeFile(filePath, buffer);

  return {
    content: [{
      type: 'text',
      text: `Written: ${args.filename} (${formatSize(buffer.length)})\nPath: ${filePath}`,
    }],
  };
}

async function handleDelete(args: WorkspaceArgs): Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }> {
  if (!args.filename) {
    return { content: [{ type: 'text', text: 'filename is required for delete operation' }], isError: true };
  }

  const filePath = resolveWorkspacePath(args.filename);
  await verifyPathSafety(filePath);

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      await fs.rm(filePath, { recursive: true });
      return { content: [{ type: 'text', text: `Deleted local directory: ${args.filename} (Jira attachments unaffected)` }] };
    }
    await fs.unlink(filePath);
  } catch {
    return { content: [{ type: 'text', text: `File not found in workspace: ${args.filename}` }], isError: true };
  }

  return { content: [{ type: 'text', text: `Deleted local file: ${args.filename} (Jira attachments unaffected)` }] };
}

async function handleMkdir(args: WorkspaceArgs): Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }> {
  if (!args.filename) {
    return { content: [{ type: 'text', text: 'filename (directory path) is required for mkdir operation' }], isError: true };
  }

  const status = await ensureWorkspaceDir();
  if (!status.valid) {
    return { content: [{ type: 'text', text: `Workspace invalid: ${status.warning}` }], isError: true };
  }

  const dirPath = resolveWorkspacePath(args.filename);
  await verifyPathSafety(dirPath);
  await fs.mkdir(dirPath, { recursive: true, mode: 0o755 });

  return {
    content: [{
      type: 'text',
      text: `Created: ${args.filename}/\nPath: ${dirPath}`,
    }],
  };
}

async function handleMove(args: WorkspaceArgs): Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }> {
  if (!args.filename) {
    return { content: [{ type: 'text', text: 'filename (source path) is required for move operation' }], isError: true };
  }
  if (!args.destination) {
    return { content: [{ type: 'text', text: 'destination path is required for move operation' }], isError: true };
  }

  const srcPath = resolveWorkspacePath(args.filename);
  await verifyPathSafety(srcPath);
  const destPath = resolveWorkspacePath(args.destination);
  await verifyPathSafety(destPath);

  try {
    await fs.stat(srcPath);
  } catch {
    return { content: [{ type: 'text', text: `Source not found in workspace: ${args.filename}` }], isError: true };
  }

  await ensureParentDir(destPath);
  await fs.rename(srcPath, destPath);

  return {
    content: [{
      type: 'text',
      text: `Moved: ${args.filename} -> ${args.destination}\nPath: ${destPath}`,
    }],
  };
}
