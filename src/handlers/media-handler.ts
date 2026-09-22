/**
 * Handler for manage_jira_media tool.
 * See ADR-211: Attachment and Workspace Management.
 */

import * as fs from 'node:fs/promises';

import type { JiraClient } from '../client/jira-client.js';
import { mediaNextSteps } from '../utils/next-steps.js';
import {
  ensureWorkspaceDir,
  formatSize,
  resolveWorkspacePath,
  ensureParentDir,
  verifyPathSafety,
  sanitizeFilename,
} from '../workspace/index.js';

interface MediaArgs {
  operation: string;
  issueKey?: string;
  attachmentId?: string;
  filename?: string;
  content?: string;
  mediaType?: string;
  workspaceFile?: string;
}

export async function handleMediaRequest(
  client: JiraClient,
  args: MediaArgs,
): Promise<{ content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; isError?: boolean }> {
  switch (args.operation) {
    case 'list': {
      if (!args.issueKey) {
        return { content: [{ type: 'text', text: 'issueKey is required for list operation' }], isError: true };
      }
      const attachments = await client.getIssueAttachments(args.issueKey);
      if (attachments.length === 0) {
        let text = `No attachments on ${args.issueKey}.`;
        text += mediaNextSteps('list', { issueKey: args.issueKey });
        return { content: [{ type: 'text', text }] };
      }
      const lines = attachments.map(a =>
        `- ${a.filename} | ${a.mimeType} | ${formatSize(a.size)} | id:${a.id} | ${a.author} | ${a.created}`,
      );
      let text = `Attachments on ${args.issueKey} (${attachments.length}):\n${lines.join('\n')}`;
      text += mediaNextSteps('list', { issueKey: args.issueKey });
      return { content: [{ type: 'text', text }] };
    }

    case 'upload': {
      if (!args.issueKey || !args.filename || !args.mediaType) {
        return {
          content: [{ type: 'text', text: 'issueKey, filename, and mediaType are required for upload' }],
          isError: true,
        };
      }

      let buffer: Buffer;
      if (args.workspaceFile) {
        const filePath = resolveWorkspacePath(args.workspaceFile);
        await verifyPathSafety(filePath);
        try {
          buffer = await fs.readFile(filePath);
        } catch {
          return { content: [{ type: 'text', text: `Workspace file not found: ${args.workspaceFile}` }], isError: true };
        }
      } else if (args.content) {
        buffer = Buffer.from(args.content, 'base64');
      } else {
        return {
          content: [{ type: 'text', text: 'Either content (base64) or workspaceFile is required for upload' }],
          isError: true,
        };
      }

      const safeFilename = sanitizeFilename(args.filename);
      const attachment = await client.uploadAttachment(args.issueKey, safeFilename, buffer, args.mediaType);
      let text = `Uploaded: ${attachment.filename} | ${attachment.mimeType} | ${formatSize(attachment.size)} | id:${attachment.id}`;
      text += mediaNextSteps('upload', { issueKey: args.issueKey });
      return { content: [{ type: 'text', text }] };
    }

    case 'delete': {
      if (!args.attachmentId) {
        return { content: [{ type: 'text', text: 'attachmentId is required for delete operation' }], isError: true };
      }
      await client.deleteAttachment(args.attachmentId);
      return { content: [{ type: 'text', text: `Permanently deleted attachment ${args.attachmentId} from Jira. This cannot be undone.` }] };
    }

    case 'view': {
      if (!args.attachmentId) {
        return { content: [{ type: 'text', text: 'attachmentId is required for view operation' }], isError: true };
      }
      const info = await client.getAttachmentInfo(args.attachmentId);
      if (!info.mimeType.startsWith('image/')) {
        return {
          content: [{
            type: 'text',
            text: `${info.filename} | ${info.mimeType} | ${formatSize(info.size)}\n\nNot an image — cannot display inline. Use download to fetch raw content.`,
          }],
        };
      }
      const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
      if (info.size > MAX_IMAGE_SIZE) {
        return {
          content: [{
            type: 'text',
            text: `${info.filename} | ${info.mimeType} | ${formatSize(info.size)}\n\nImage too large to display inline (${(info.size / 1024 / 1024).toFixed(1)}MB, max 5MB). Use download instead.`,
          }],
        };
      }
      const bytes = await client.downloadAttachment(args.attachmentId);
      return {
        content: [
          { type: 'text', text: `${info.filename} | ${info.mimeType}` },
          { type: 'image', data: bytes.toString('base64'), mimeType: info.mimeType },
        ],
      };
    }

    case 'get_info': {
      if (!args.attachmentId) {
        return { content: [{ type: 'text', text: 'attachmentId is required for get_info operation' }], isError: true };
      }
      const attachInfo = await client.getAttachmentInfo(args.attachmentId);
      return {
        content: [{
          type: 'text',
          text: `${attachInfo.filename} | ${attachInfo.mimeType} | ${formatSize(attachInfo.size)} | id:${attachInfo.id} | ${attachInfo.author} | ${attachInfo.created}`,
        }],
      };
    }

    case 'download': {
      if (!args.attachmentId) {
        return { content: [{ type: 'text', text: 'attachmentId is required for download operation' }], isError: true };
      }
      const dlInfo = await client.getAttachmentInfo(args.attachmentId);
      const dlBytes = await client.downloadAttachment(args.attachmentId);

      const status = await ensureWorkspaceDir();
      if (!status.valid) {
        return { content: [{ type: 'text', text: `Workspace invalid: ${status.warning}` }], isError: true };
      }

      const dlFilename = args.filename || sanitizeFilename(dlInfo.filename);
      const dlPath = resolveWorkspacePath(dlFilename);
      await verifyPathSafety(dlPath);
      await ensureParentDir(dlPath);
      await fs.writeFile(dlPath, dlBytes);

      let text = `Downloaded: ${dlFilename} | ${dlInfo.mimeType} | ${formatSize(dlBytes.length)}\nPath: ${dlPath}`;
      text += `\n\nUse manage_local_workspace read or manage_jira_media upload with workspaceFile:"${dlFilename}" to use it.`;
      text += mediaNextSteps('download', {});
      return { content: [{ type: 'text', text }] };
    }

    default:
      return { content: [{ type: 'text', text: `Unknown media operation: ${args.operation}` }], isError: true };
  }
}

