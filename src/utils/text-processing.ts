import { AdfNode } from '../types/index.js';

export class TextProcessor {
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
              .replace(/(?:(?:https?|ftp):\/\/|\b(?:[a-z\d]+\.))(?:(?:[^\s()<>]+|\((?:[^\s()<>]+|(?:\([^\s()<>]+\)))?\))+(?:\((?:[^\s()<>]+|(?:\(?:[^\s()<>]+\)))?\)|[^\s`!()\[\]{};:'".,<>?«»""'']))?/g, '')
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
        .filter(([k, v]) => 
          !TextProcessor.shouldExcludeField(k, v) && 
          v !== null && 
          v !== undefined && 
          !k.startsWith('_'))
        .map(([k, v]) => TextProcessor.formatFieldValue(v))
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
