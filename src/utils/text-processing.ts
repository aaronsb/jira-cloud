import MarkdownIt from 'markdown-it';

import { AdfNode } from '../types/index.js';

// Jira accountIds: hex strings or "712020:uuid-format"
const MENTION_RE = /@([a-zA-Z0-9][a-zA-Z0-9:_-]{9,})/g;

export class TextProcessor {
  private static md = new MarkdownIt().enable('strikethrough');

  /**
   * Split text into alternating text and mention ADF nodes.
   * Recognizes @accountId patterns and converts them to ADF mention nodes.
   */
  private static splitMentions(text: string, marks?: any[]): any[] {
    const nodes: any[] = [];
    let lastIndex = 0;
    MENTION_RE.lastIndex = 0;
    let match;

    while ((match = MENTION_RE.exec(text)) !== null) {
      // Text before the mention
      if (match.index > lastIndex) {
        const before = text.slice(lastIndex, match.index);
        const node: any = { type: 'text', text: before };
        if (marks?.length) node.marks = marks;
        nodes.push(node);
      }
      // Mention node
      nodes.push({
        type: 'mention',
        attrs: { id: match[1], text: `@${match[1]}` },
      });
      lastIndex = MENTION_RE.lastIndex;
    }

    // Remaining text after last mention
    if (lastIndex < text.length) {
      const remaining = text.slice(lastIndex);
      const node: any = { type: 'text', text: remaining };
      if (marks?.length) node.marks = marks;
      nodes.push(node);
    }

    // No mentions found — return empty so caller uses original logic
    if (nodes.length === 0) return [];
    return nodes;
  }

  static markdownToAdf(markdown: string): any {
    // Replace literal \n sequences with actual newlines so markdown-it
    // correctly splits paragraphs. MCP JSON transport may deliver these
    // as escaped two-character sequences rather than real newline chars.
    const normalized = markdown.replace(/\\n/g, '\n');
    const tokens = TextProcessor.md.parse(normalized, {});
    const content: any[] = [];
    let currentListItems: any[] = [];
    let isInList = false;
    let listType: string | null = null;

    for (const token of tokens) {
      switch (token.type) {
        case 'heading_open':
          // Start a new heading block
          content.push({
            type: 'heading',
            attrs: { level: parseInt(token.tag.slice(1)) },
            content: []
          });
          break;

        case 'heading_close':
          break;

        case 'paragraph_open':
          if (!isInList) {
            content.push({
              type: 'paragraph',
              content: []
            });
          }
          break;

        case 'paragraph_close':
          break;

        case 'bullet_list_open':
        case 'ordered_list_open':
          isInList = true;
          listType = token.type === 'bullet_list_open' ? 'bulletList' : 'orderedList';
          currentListItems = [];
          break;

        case 'bullet_list_close':
        case 'ordered_list_close':
          if (currentListItems.length > 0) {
            content.push({
              type: listType!,
              content: currentListItems
            });
          }
          isInList = false;
          listType = null;
          currentListItems = [];
          break;

        case 'list_item_open':
          currentListItems.push({
            type: 'listItem',
            content: [{
              type: 'paragraph',
              content: []
            }]
          });
          break;

        case 'list_item_close':
          break;

        case 'inline':
          const lastBlock = isInList 
            ? currentListItems[currentListItems.length - 1].content[0]
            : content[content.length - 1];
          
          if (!lastBlock) continue;

          let currentText = '';
          let marks: any[] = [];

          for (let i = 0; i < token.children!.length; i++) {
            const child = token.children![i];

            if (child.type === 'text') {
              // Check for @accountId mentions in this text segment
              const mentionNodes = TextProcessor.splitMentions(child.content, marks.length > 0 ? marks : undefined);
              if (mentionNodes.length > 0) {
                // Flush any pending plain text first
                if (currentText) {
                  lastBlock.content.push({
                    type: 'text',
                    text: currentText,
                    ...(marks.length > 0 && { marks })
                  });
                  currentText = '';
                }
                lastBlock.content.push(...mentionNodes);
                // Reset marks after flushing mention-bearing text
                if (marks.length > 0) marks = [];
                continue;
              }
              if (currentText && marks.length > 0) {
                lastBlock.content.push({
                  type: 'text',
                  text: currentText,
                  marks
                });
                currentText = '';
                marks = [];
              }
              currentText = child.content;
            } else if (child.type === 'strong_open') {
              if (currentText) {
                lastBlock.content.push({
                  type: 'text',
                  text: currentText
                });
                currentText = '';
              }
              marks.push({ type: 'strong' });
            } else if (child.type === 'em_open') {
              if (currentText) {
                lastBlock.content.push({
                  type: 'text',
                  text: currentText
                });
                currentText = '';
              }
              marks.push({ type: 'em' });
            } else if (child.type === 's_open') {
              if (currentText) {
                lastBlock.content.push({
                  type: 'text',
                  text: currentText
                });
                currentText = '';
              }
              marks.push({ type: 'strike' });
            } else if (child.type === 'link_open') {
              if (currentText) {
                lastBlock.content.push({
                  type: 'text',
                  text: currentText
                });
                currentText = '';
              }
              marks.push({
                type: 'link',
                attrs: {
                  href: child.attrs![0][1]
                }
              });
            } else if (child.type === 'code_inline') {
              if (currentText) {
                lastBlock.content.push({
                  type: 'text',
                  text: currentText
                });
                currentText = '';
              }
              lastBlock.content.push({
                type: 'text',
                text: child.content,
                marks: [{ type: 'code' }]
              });
            }
          }

          if (currentText) {
            lastBlock.content.push({
              type: 'text',
              text: currentText,
              ...(marks.length > 0 && { marks })
            });
          }
          break;

        case 'hr':
          content.push({
            type: 'rule'
          });
          break;

        case 'hardbreak':
          const lastContent = content[content.length - 1];
          if (lastContent && lastContent.content) {
            lastContent.content.push({
              type: 'hardBreak'
            });
          }
          break;
      }
    }

    return {
      type: 'doc',
      version: 1,
      content
    };
  }

  static extractTextFromAdf(node: AdfNode): string {
    if (!node) return '';

    if (node.type === 'text') {
      return node.text || '';
    }

    if (node.type === 'mention') {
      return `@${node.attrs?.text?.replace('@', '') || ''}`;
    }

    if (node.type === 'hardBreak' || node.type === 'paragraph') {
      return '\n';
    }

    if (node.content) {
      return node.content
        .map((child: AdfNode) => TextProcessor.extractTextFromAdf(child))
        .join('')
        .replace(/\n{3,}/g, '\n\n'); // Normalize multiple newlines
    }

    return '';
  }

  /**
   * Convert ADF to markdown, preserving formatting for round-trip fidelity.
   * This is the inverse of markdownToAdf — the agent reads markdown and
   * writes markdown, so the formatting survives the Jira round-trip.
   */
  static adfToMarkdown(node: any): string {
    if (!node) return '';

    switch (node.type) {
      case 'doc':
        return (node.content || [])
          .map((child: any) => TextProcessor.adfToMarkdown(child))
          .join('\n\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim();

      case 'paragraph':
        return (node.content || [])
          .map((child: any) => TextProcessor.adfToMarkdown(child))
          .join('');

      case 'heading': {
        const level = node.attrs?.level || 1;
        const prefix = '#'.repeat(level);
        const text = (node.content || [])
          .map((child: any) => TextProcessor.adfToMarkdown(child))
          .join('');
        return `${prefix} ${text}`;
      }

      case 'text': {
        let text = node.text || '';
        if (node.marks) {
          for (const mark of node.marks) {
            switch (mark.type) {
              case 'strong':
                text = `**${text}**`;
                break;
              case 'em':
                text = `*${text}*`;
                break;
              case 'strike':
                text = `~~${text}~~`;
                break;
              case 'code':
                text = `\`${text}\``;
                break;
              case 'link':
                text = `[${text}](${mark.attrs?.href || ''})`;
                break;
            }
          }
        }
        return text;
      }

      case 'mention':
        // Emit @accountId so the agent can reuse it in comments
        return `@${node.attrs?.id || node.attrs?.text?.replace('@', '') || ''}`;

      case 'hardBreak':
        return '\n';

      case 'bulletList':
        return (node.content || [])
          .map((child: any) => TextProcessor.adfToMarkdown(child))
          .join('\n');

      case 'orderedList':
        return (node.content || [])
          .map((child: any, i: number) => {
            const itemText = TextProcessor.adfListItemContent(child);
            return `${i + 1}. ${itemText}`;
          })
          .join('\n');

      case 'listItem': {
        const itemText = TextProcessor.adfListItemContent(node);
        return `- ${itemText}`;
      }

      case 'codeBlock': {
        const lang = node.attrs?.language || '';
        const code = (node.content || [])
          .map((child: any) => child.text || '')
          .join('');
        return `\`\`\`${lang}\n${code}\n\`\`\``;
      }

      case 'blockquote': {
        const content = (node.content || [])
          .map((child: any) => TextProcessor.adfToMarkdown(child))
          .join('\n');
        return content.split('\n').map((line: string) => `> ${line}`).join('\n');
      }

      case 'rule':
        return '---';

      case 'table':
      case 'tableRow':
      case 'tableHeader':
      case 'tableCell':
        // Flatten table content to text — ADF tables don't round-trip well through markdown
        return (node.content || [])
          .map((child: any) => TextProcessor.adfToMarkdown(child))
          .join(node.type === 'tableRow' ? ' | ' : '\n');

      case 'mediaSingle':
      case 'media':
        // Media nodes can't round-trip; skip silently
        return '';

      case 'inlineCard':
        return node.attrs?.url || '';

      default:
        // Unknown node — recurse into children if present
        if (node.content) {
          return (node.content || [])
            .map((child: any) => TextProcessor.adfToMarkdown(child))
            .join('');
        }
        return node.text || '';
    }
  }

  /** Extract text content from a listItem node (skipping the wrapping paragraph) */
  private static adfListItemContent(node: any): string {
    return (node.content || [])
      .map((child: any) => {
        if (child.type === 'paragraph') {
          return (child.content || [])
            .map((c: any) => TextProcessor.adfToMarkdown(c))
            .join('');
        }
        return TextProcessor.adfToMarkdown(child);
      })
      .join('\n');
  }

  static isFieldPopulated(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    if (typeof value === 'object' && Object.keys(value).length === 0) return false;
    return true;
  }

  static shouldExcludeField(fieldId: string, fieldValue: any): boolean {
    // Exclude system metadata and UI-specific fields
    const excludePatterns = [
      'avatar', 'icon', 'self', 'thumbnail', 'timetracking', 'worklog',
      'watches', 'subtasks', 'attachment', 'aggregateprogress', 'progress',
      'votes', '_links', 'accountId', 'emailAddress', 'active', 'timeZone',
      'accountType', '_expands', 'groupIds', 'portalId', 'serviceDeskId',
      'issueTypeId', 'renderedFields', 'names', 'id', 'expand', 'schema',
      'operations', 'editmeta', 'changelog', 'versionedRepresentations',
      'fieldsToInclude', 'properties', 'updateAuthor', 'jsdPublic', 'mediaType',
      'maxResults', 'total', 'startAt', 'iconUrls', 'issuerestrictions',
      'shouldDisplay', 'nonEditableReason', 'hasEpicLinkFieldDependency',
      'showField', 'statusDate', 'statusCategory', 'collection', 'localId',
      'attrs', 'marks', 'layout', 'version', 'type', 'content', 'table',
      'tableRow', 'tableCell', 'mediaSingle', 'media', 'heading', 'paragraph',
      'bulletList', 'listItem', 'orderedList', 'rule', 'inlineCard', 'hardBreak',
      'workRatio', 'parentLink', 'restrictTo', 'timeToResolution',
      'timeToFirstResponse', 'slaForInitialResponse'
    ];

    // Also exclude email signature related fields and meaningless values
    if (typeof fieldValue === 'string') {
      // Email signature patterns
      const emailPatterns = [
        'CAUTION:', 'From:', 'Sent:', 'To:', 'Subject:',
        'Book time to meet with me', 'Best-', 'Best regards',
        'Kind regards', 'Regards,', 'Mobile', 'Phone', 'Tel:',
        'www.', 'http://', 'https://', '@.*\\.com$', '^M:',
        'LLC', 'Inc.', 'Ltd.', 'ForefrontDermatology.com',
        'Mobile:', 'Office:', 'Direct:'
      ];

      // Check for email patterns
      if (emailPatterns.some(pattern => 
        pattern.startsWith('^') || pattern.endsWith('$') 
          ? new RegExp(pattern).test(fieldValue)
          : fieldValue.includes(pattern)
      )) {
        return true;
      }

      // Exclude meaningless values
      if (fieldValue === '-1' || 
          fieldValue === 'false false' ||
          fieldValue === '0' ||
          fieldValue === 'true, ' ||
          fieldValue === '.' ||
          /^\s*$/.test(fieldValue)) {
        return true;
      }
    }

    // Exclude fields that are just punctuation or very short text
    if (typeof fieldValue === 'string' && 
        (fieldValue.trim().length <= 1 || 
         fieldValue.trim() === '.' || 
         fieldValue.trim() === '-' ||
         fieldValue.trim() === '_')) {
      return true;
    }

    return excludePatterns.some(pattern => 
      fieldId.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  static formatFieldValue(value: any, fieldName?: string): string {
    if (value === null || value === undefined) return '';
    
    // Handle arrays
    if (Array.isArray(value)) {
      // Special handling for comments
      if (fieldName === 'Comment' || fieldName === 'comments') {
        return value
          .map(comment => {
            const author = comment.author?.displayName || 'Unknown';
            let body = '';
            
            // Handle rich text content
            if (comment.body?.content) {
              body = TextProcessor.extractTextFromAdf(comment.body);
            } else {
              body = String(comment.body || '');
            }

            // Clean up email signatures and formatting from body
            body = body
              .replace(/^[\s\S]*?From:[\s\S]*?Sent:[\s\S]*?To:[\s\S]*?Subject:[\s\S]*?\n/gm, '')
              .replace(/^>.*$/gm, '')
              .replace(/_{3,}|-{3,}|={3,}/g, '')
              .replace(/(?:(?:https?|ftp):\/\/|\b(?:[a-z\d]+\.))(?:(?:[^\s()<>]+|\((?:[^\s()<>]+|(?:\([^\s()<>]+\)))?\))+(?:\((?:[^\s()<>]+|(?:\(?:[^\s()<>]+\)))?\)|[^\s`!()[\]{};:'".,<>?«»""'']))?/g, '')
              .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '')
              .replace(/(?:^|\s)(?:Best regards|Kind regards|Regards|Best|Thanks|Thank you|Cheers),.*/gs, '')
              .replace(/(?:Mobile|Tel|Phone|Office|Direct):\s*[\d\s.+-]+/g, '')
              .replace(/\n{3,}/g, '\n\n')
              .trim();

            if (!body) return '';

            const created = new Date(comment.created).toLocaleString();
            return `${author} (${created}):\n${body}`;
          })
          .filter(comment => comment)
          .join('\n\n');
      }
      
      return value
        .map(item => TextProcessor.formatFieldValue(item))
        .filter(item => item)
        .join(', ');
    }

    // Handle objects
    if (typeof value === 'object') {
      // Handle user objects
      if (value.displayName) {
        return value.displayName;
      }
      
      // Handle request type
      if (value.requestType?.name) {
        const desc = value.requestType.description ? 
          ': ' + value.requestType.description.split('.')[0] + '.' : '';
        return `${value.requestType.name}${desc}`;
      }

      // Handle status objects
      if (value.status && value.statusCategory) {
        return `${value.status} (${value.statusCategory})`;
      }

      // Handle rich text content
      if (value.content) {
        return TextProcessor.extractTextFromAdf(value);
      }

      // Handle simple name/value objects
      if (value.name) {
        return value.name;
      }
      if (value.value) {
        return value.value;
      }

      // For other objects, try to extract meaningful values
      const meaningful = Object.entries(value)
        .filter(([_k, v]) => 
          !TextProcessor.shouldExcludeField(_k, v) && 
          v !== null && 
          v !== undefined && 
          !_k.startsWith('_'))
        .map(([_k, v]) => TextProcessor.formatFieldValue(v))
        .filter(v => v)
        .join(' ');
      
      return meaningful || '';
    }

    // Format dates
    if (fieldName && (
      fieldName.toLowerCase().includes('date') || 
      fieldName.toLowerCase().includes('created') || 
      fieldName.toLowerCase().includes('updated')
    )) {
      try {
        return new Date(value).toLocaleString();
      } catch {
        return String(value);
      }
    }

    // Handle primitive values
    return String(value);
  }
}
