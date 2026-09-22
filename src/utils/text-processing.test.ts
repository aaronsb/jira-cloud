import { describe, it, expect } from 'vitest';
import { TextProcessor } from './text-processing.js';

describe('markdownToAdf @mention support', () => {
  it('converts @accountId to ADF mention node', () => {
    const adf = TextProcessor.markdownToAdf('Hello @5abc123def456');
    const paragraph = adf.content[0];
    expect(paragraph.content).toHaveLength(2);
    expect(paragraph.content[0]).toEqual({ type: 'text', text: 'Hello ' });
    expect(paragraph.content[1]).toEqual({
      type: 'mention',
      attrs: { id: '5abc123def456', text: '@5abc123def456' },
    });
  });

  it('converts uuid-style accountId with colons', () => {
    const adf = TextProcessor.markdownToAdf('cc @712020:abcdef12-3456-7890-abcd-ef1234567890');
    const paragraph = adf.content[0];
    expect(paragraph.content[1]).toEqual({
      type: 'mention',
      attrs: { id: '712020:abcdef12-3456-7890-abcd-ef1234567890', text: '@712020:abcdef12-3456-7890-abcd-ef1234567890' },
    });
  });

  it('handles multiple mentions in one line', () => {
    const adf = TextProcessor.markdownToAdf('@5abc123def456 and @5def789abc012 please review');
    const paragraph = adf.content[0];
    expect(paragraph.content).toHaveLength(4);
    expect(paragraph.content[0].type).toBe('mention');
    expect(paragraph.content[1]).toEqual({ type: 'text', text: ' and ' });
    expect(paragraph.content[2].type).toBe('mention');
    expect(paragraph.content[3]).toEqual({ type: 'text', text: ' please review' });
  });

  it('does not match short strings after @', () => {
    const adf = TextProcessor.markdownToAdf('Hello @bob');
    const paragraph = adf.content[0];
    expect(paragraph.content).toHaveLength(1);
    expect(paragraph.content[0].type).toBe('text');
    expect(paragraph.content[0].text).toBe('Hello @bob');
  });

  it('leaves plain text without mentions unchanged', () => {
    const adf = TextProcessor.markdownToAdf('No mentions here');
    const paragraph = adf.content[0];
    expect(paragraph.content).toHaveLength(1);
    expect(paragraph.content[0]).toEqual({ type: 'text', text: 'No mentions here' });
  });

  it('preserves bold marks around mentions', () => {
    const adf = TextProcessor.markdownToAdf('**@5abc123def456 important**');
    const paragraph = adf.content[0];
    const mention = paragraph.content.find((n: any) => n.type === 'mention');
    expect(mention).toBeDefined();
    expect(mention.attrs.id).toBe('5abc123def456');
  });
});

describe('markdownToAdf strikethrough support', () => {
  it('converts ~~text~~ to ADF strike mark', () => {
    const adf = TextProcessor.markdownToAdf('This is ~~deleted~~ text');
    const paragraph = adf.content[0];
    const strikeNode = paragraph.content.find(
      (n: any) => n.marks?.some((m: any) => m.type === 'strike')
    );
    expect(strikeNode).toBeDefined();
    expect(strikeNode.text).toBe('deleted');
    expect(strikeNode.marks).toEqual([{ type: 'strike' }]);
  });
});

describe('adfToMarkdown', () => {
  it('converts plain paragraph', () => {
    const adf = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Hello world' }],
      }],
    };
    expect(TextProcessor.adfToMarkdown(adf)).toBe('Hello world');
  });

  it('converts headings', () => {
    const adf = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Section Title' }],
      }],
    };
    expect(TextProcessor.adfToMarkdown(adf)).toBe('## Section Title');
  });

  it('converts bold, italic, strikethrough, and code marks', () => {
    const adf = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'bold', marks: [{ type: 'strong' }] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'italic', marks: [{ type: 'em' }] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'struck', marks: [{ type: 'strike' }] },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'code', marks: [{ type: 'code' }] },
        ],
      }],
    };
    expect(TextProcessor.adfToMarkdown(adf)).toBe('**bold** *italic* ~~struck~~ `code`');
  });

  it('converts links', () => {
    const adf = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Click ', },
          { type: 'text', text: 'here', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] },
        ],
      }],
    };
    expect(TextProcessor.adfToMarkdown(adf)).toBe('Click [here](https://example.com)');
  });

  it('applies link mark outermost with combined bold+link', () => {
    const adf = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'important', marks: [
            { type: 'strong' },
            { type: 'link', attrs: { href: 'https://example.com' } },
          ]},
        ],
      }],
    };
    expect(TextProcessor.adfToMarkdown(adf)).toBe('[**important**](https://example.com)');
  });

  it('converts bullet lists', () => {
    const adf = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }] },
        ],
      }],
    };
    expect(TextProcessor.adfToMarkdown(adf)).toBe('- First\n- Second');
  });

  it('converts ordered lists', () => {
    const adf = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'orderedList',
        content: [
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] },
          { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }] },
        ],
      }],
    };
    expect(TextProcessor.adfToMarkdown(adf)).toBe('1. First\n2. Second');
  });

  it('converts code blocks', () => {
    const adf = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'codeBlock',
        attrs: { language: 'js' },
        content: [{ type: 'text', text: 'const x = 1;' }],
      }],
    };
    expect(TextProcessor.adfToMarkdown(adf)).toBe('```js\nconst x = 1;\n```');
  });

  it('converts mentions to @accountId', () => {
    const adf = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Assigned to ' },
          { type: 'mention', attrs: { id: '5abc123def456', text: '@Aaron' } },
        ],
      }],
    };
    expect(TextProcessor.adfToMarkdown(adf)).toBe('Assigned to @5abc123def456');
  });

  it('converts blockquotes', () => {
    const adf = {
      type: 'doc',
      version: 1,
      content: [{
        type: 'blockquote',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'Quoted text' }],
        }],
      }],
    };
    expect(TextProcessor.adfToMarkdown(adf)).toBe('> Quoted text');
  });

  it('converts horizontal rules', () => {
    const adf = {
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] },
        { type: 'rule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'After' }] },
      ],
    };
    expect(TextProcessor.adfToMarkdown(adf)).toBe('Before\n\n---\n\nAfter');
  });

  it('handles empty/null nodes gracefully', () => {
    expect(TextProcessor.adfToMarkdown(null)).toBe('');
    expect(TextProcessor.adfToMarkdown(undefined)).toBe('');
    expect(TextProcessor.adfToMarkdown({ type: 'doc', content: [] })).toBe('');
  });
});

describe('markdown round-trip: markdown → ADF → markdown', () => {
  it('round-trips headings', () => {
    const md = '## My Heading';
    const adf = TextProcessor.markdownToAdf(md);
    const result = TextProcessor.adfToMarkdown(adf);
    expect(result).toBe('## My Heading');
  });

  it('round-trips bold and italic', () => {
    const md = '**bold** and *italic*';
    const adf = TextProcessor.markdownToAdf(md);
    const result = TextProcessor.adfToMarkdown(adf);
    expect(result).toBe('**bold** and *italic*');
  });

  it('round-trips strikethrough', () => {
    const md = '~~deleted text~~';
    const adf = TextProcessor.markdownToAdf(md);
    const result = TextProcessor.adfToMarkdown(adf);
    expect(result).toBe('~~deleted text~~');
  });

  it('round-trips bullet lists', () => {
    const md = '- First\n- Second';
    const adf = TextProcessor.markdownToAdf(md);
    const result = TextProcessor.adfToMarkdown(adf);
    expect(result).toBe('- First\n- Second');
  });

  it('round-trips mentions', () => {
    const md = 'cc @5abc123def456';
    const adf = TextProcessor.markdownToAdf(md);
    const result = TextProcessor.adfToMarkdown(adf);
    expect(result).toBe('cc @5abc123def456');
  });
});

describe('extractTextFromAdf mention support', () => {
  it('extracts mention as @text from paragraph', () => {
    const paragraph = {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'mention', attrs: { id: '5abc123', text: '@Aaron' } },
      ],
    };
    const result = paragraph.content
      .map((child: any) => TextProcessor.extractTextFromAdf(child))
      .join('');
    expect(result).toBe('Hello @Aaron');
  });
});

describe('formatFieldValue — cascading options', () => {
  it('renders cascading option as "parent / child" (like JSM "Jira / Jira User")', () => {
    const result = TextProcessor.formatFieldValue({
      value: 'Jira',
      id: '10962',
      child: { value: 'Jira User', id: '11004' },
    });
    expect(result).toBe('Jira / Jira User');
  });

  it('falls back to parent value when child is missing', () => {
    const result = TextProcessor.formatFieldValue({ value: 'Jira' });
    expect(result).toBe('Jira');
  });

  it('still extracts parent value when child is empty object', () => {
    // Child present but empty — extractor recurses, meaningful returns '', so we fall back to parent
    const result = TextProcessor.formatFieldValue({
      value: 'Jira',
      child: {},
    });
    expect(result).toBe('Jira');
  });

  it('works inside arrays (multi-select cascading rare but legal)', () => {
    const result = TextProcessor.formatFieldValue([
      { value: 'Jira', child: { value: 'Jira User' } },
      { value: 'Confluence', child: { value: 'Space Admin' } },
    ]);
    expect(result).toBe('Jira / Jira User, Confluence / Space Admin');
  });
});
