import { describe, it, expect } from 'vitest';
import { getPrompt } from './prompt-messages.js';
import { promptDefinitions } from './prompt-definitions.js';

describe('getPrompt', () => {
  it('returns messages for backlog_health', () => {
    const result = getPrompt('backlog_health', { project: 'PROJ' });
    expect(result.description).toContain('PROJ');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe('user');
    expect(result.messages[0].content.text).toContain('project = PROJ');
    expect(result.messages[0].content.text).toContain('backlog_rot');
  });

  it('returns messages for contributor_workload', () => {
    const result = getPrompt('contributor_workload', { project: 'ENG' });
    expect(result.messages[0].content.text).toContain('project = ENG');
    expect(result.messages[0].content.text).toContain('assignee');
  });

  it('returns messages for sprint_review', () => {
    const result = getPrompt('sprint_review', { board_id: '42' });
    expect(result.messages[0].content.text).toContain('boardId');
    expect(result.messages[0].content.text).toContain('42');
  });

  it('returns messages for narrow_analysis', () => {
    const result = getPrompt('narrow_analysis', { jql: 'project = PROJ AND resolution = Unresolved' });
    expect(result.messages[0].content.text).toContain('project = PROJ');
    expect(result.messages[0].content.text).toContain('sample');
  });

  it('throws on unknown prompt', () => {
    expect(() => getPrompt('nonexistent', {})).toThrow('Unknown prompt');
  });

  it('throws on missing required argument', () => {
    expect(() => getPrompt('backlog_health', {})).toThrow('Missing required argument');
  });

  it('all defined prompts have builders', () => {
    for (const def of promptDefinitions) {
      const args: Record<string, string> = {};
      for (const arg of def.arguments) {
        args[arg.name] = 'test_value';
      }
      const result = getPrompt(def.name, args);
      expect(result.messages.length).toBeGreaterThan(0);
    }
  });
});
