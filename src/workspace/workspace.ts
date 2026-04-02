/**
 * Workspace directory — safe sandbox for file staging operations.
 *
 * All file operations (attachment download, upload, media staging) are jailed
 * to this directory. Prevents agents from accidentally operating on home
 * directories, document folders, or cloud sync mount points.
 *
 * See ADR-211: Attachment and Workspace Management.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const APP_NAME = 'jira-cloud-mcp';

// ── XDG Paths ──────────────────────────────────────────────

export function dataDir(): string {
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, APP_NAME);
}

// ── Forbidden Paths ────────────────────────────────────────

/** Paths that must never be used as the workspace root. */
const FORBIDDEN_PATHS = [
  () => process.env.HOME ?? '',
  () => process.env.USERPROFILE ?? '',
  () => process.env.HOME ? path.join(process.env.HOME, 'Documents') : '',
  () => process.env.HOME ? path.join(process.env.HOME, 'Desktop') : '',
  () => process.env.HOME ? path.join(process.env.HOME, 'Downloads') : '',
  () => process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Documents') : '',
  () => process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Desktop') : '',
  () => process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'Downloads') : '',
];

/** Path substrings that indicate a cloud sync mount. */
const CLOUD_SYNC_PATTERNS = [
  'google-drive',
  'Google Drive',
  'GoogleDrive',
  'gdrive',
  'My Drive',
  'OneDrive',
  'onedrive',
  'Dropbox',
  'dropbox',
  'iCloud Drive',
  'iCloudDrive',
];

// ── Workspace Directory ────────────────────────────────────

/** Get the workspace directory path, respecting env overrides. */
export function getWorkspaceDir(): string {
  const configured = process.env.WORKSPACE_DIR;
  if (configured && !configured.includes('${')) {
    return configured;
  }
  return path.join(dataDir(), 'workspace');
}

/**
 * Validate workspace dir is safe. Throws if it IS a protected directory.
 * Being a subdirectory OF a protected directory is fine.
 */
export function validateWorkspaceDir(dir: string): void {
  const resolved = path.resolve(dir);

  for (const getForbidden of FORBIDDEN_PATHS) {
    const forbidden = getForbidden();
    if (forbidden && path.resolve(forbidden) === resolved) {
      throw new Error(
        `Workspace directory cannot be ${resolved} — use a subdirectory like ${getWorkspaceDir()}`,
      );
    }
  }

  for (const pattern of CLOUD_SYNC_PATTERNS) {
    if (resolved.toLowerCase().includes(pattern.toLowerCase())) {
      throw new Error(
        `Workspace directory cannot be inside a cloud sync mount (${resolved}) — this could cause sync conflicts`,
      );
    }
  }

  if (resolved === '/' || resolved === 'C:\\') {
    throw new Error('Workspace directory cannot be the filesystem root');
  }
}

export interface WorkspaceStatus {
  path: string;
  valid: boolean;
  warning?: string;
}

/** Check workspace directory status without throwing. */
export function checkWorkspaceStatus(): WorkspaceStatus {
  const dir = getWorkspaceDir();
  try {
    validateWorkspaceDir(dir);
    return { path: dir, valid: true };
  } catch (err) {
    return { path: dir, valid: false, warning: (err as Error).message };
  }
}

/** Ensure the workspace directory exists and is validated. */
export async function ensureWorkspaceDir(): Promise<WorkspaceStatus> {
  const status = checkWorkspaceStatus();
  if (status.valid) {
    await fs.mkdir(status.path, { recursive: true, mode: 0o755 });
  }
  return status;
}

// ── Filename Sanitization ──────────────────────────────────

/**
 * Sanitize a single filename segment (no separators).
 * Strips null bytes, control characters, path separators, and dangerous chars.
 */
export function sanitizeFilename(filename: string): string {
  return filename
    // Remove null bytes and control characters
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    // Remove path separators
    .replace(/[/\\]/g, '_')
    // Remove other dangerous characters
    .replace(/[<>:"|?*]/g, '_')
    // Collapse multiple underscores
    .replace(/_+/g, '_')
    // Remove leading dots (hidden files) and trailing dots/spaces
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    || 'unnamed';
}

/**
 * Sanitize a workspace path that may contain directory separators.
 * Each path segment is sanitized individually, preserving the directory structure.
 * Empty segments and traversal attempts (e.g. '..') are removed.
 */
export function sanitizePath(filePath: string): string {
  // Normalize separators to forward slash, split into segments
  const segments = filePath
    .replace(/\\/g, '/')
    .split('/')
    .map(seg => sanitizeFilename(seg))
    // Drop segments that sanitized to 'unnamed' (e.g. '..' → '' → 'unnamed').
    // Only keep 'unnamed' if the entire input was empty (fallback sentinel).
    .filter(seg => seg !== 'unnamed' || filePath.trim() === '');

  if (segments.length === 0) return 'unnamed';
  return segments.join(path.sep);
}

// ── Path Resolution ────────────────────────────────────────

/**
 * Resolve a file path within the workspace directory.
 * Supports nested paths (e.g. 'projects/report.csv').
 * Prevents path traversal and sanitizes each path segment.
 */
export function resolveWorkspacePath(filePath: string): string {
  const dir = getWorkspaceDir();
  // Use sanitizePath for nested paths, sanitizeFilename for flat filenames
  const sanitized = filePath.includes('/') || filePath.includes('\\')
    ? sanitizePath(filePath)
    : sanitizeFilename(filePath);
  const resolved = path.resolve(dir, sanitized);

  const resolvedDir = path.resolve(dir);
  if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) {
    throw new Error(
      `Path traversal detected: "${filePath}" resolves outside workspace directory`,
    );
  }

  return resolved;
}

/**
 * Ensure parent directories exist for a workspace path.
 * Call after resolveWorkspacePath to create intermediate dirs.
 */
export async function ensureParentDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true, mode: 0o755 });
}

/**
 * Verify a file path is safe after symlink resolution.
 * Must be called before any fs operation on a workspace path.
 */
export async function verifyPathSafety(filePath: string): Promise<void> {
  const dir = path.resolve(getWorkspaceDir());
  try {
    const real = await fs.realpath(filePath);
    if (!real.startsWith(dir + path.sep) && real !== dir) {
      throw new Error(
        `Symlink escape detected: "${filePath}" resolves to "${real}" outside workspace`,
      );
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
}
