import { describe, it, expect } from 'vitest';
import { toolSchemas } from './tool-schemas.js';

const EXPECTED_TOOLS = [
  'manage_jira_issue',
  'manage_jira_filter',
  'manage_jira_project',
  'manage_jira_board',
  'manage_jira_sprint',
];

describe('toolSchemas', () => {
  it('exports all 5 tools', () => {
    expect(Object.keys(toolSchemas).sort()).toEqual(EXPECTED_TOOLS.sort());
  });

  for (const toolName of EXPECTED_TOOLS) {
    describe(toolName, () => {
      const schema = toolSchemas[toolName as keyof typeof toolSchemas];

      it('has name matching its key', () => {
        expect(schema.name).toBe(toolName);
      });

      it('has a non-empty description', () => {
        expect(schema.description.length).toBeGreaterThan(10);
      });

      it('has operation as the only required field', () => {
        expect(schema.inputSchema.required).toEqual(['operation']);
      });

      it('has operation enum defined', () => {
        const opProp = schema.inputSchema.properties.operation;
        expect(opProp.type).toBe('string');
        expect(Array.isArray(opProp.enum)).toBe(true);
        expect(opProp.enum.length).toBeGreaterThan(0);
      });

      it('has no "Can also use snake_case" in any description', () => {
        for (const [, prop] of Object.entries(schema.inputSchema.properties)) {
          const p = prop as { description?: string };
          if (p.description) {
            expect(p.description).not.toContain('snake_case');
          }
        }
      });
    });
  }

  it('assignee description says accountId, not username', () => {
    const issueSchema = toolSchemas.manage_jira_issue;
    const assigneeProp = issueSchema.inputSchema.properties.assignee as { description: string };
    expect(assigneeProp.description.toLowerCase()).toContain('accountid');
    expect(assigneeProp.description.toLowerCase()).not.toContain('username');
  });

  it('lead description says accountId, not username', () => {
    const projectSchema = toolSchemas.manage_jira_project;
    const leadProp = projectSchema.inputSchema.properties.lead as { description: string };
    expect(leadProp.description.toLowerCase()).toContain('accountid');
  });

  it('jql description references tool documentation resource', () => {
    const filterSchema = toolSchemas.manage_jira_filter;
    const jqlProp = filterSchema.inputSchema.properties.jql as { description: string };
    expect(jqlProp.description).toContain('jira://tools/manage_jira_filter/documentation');
  });

  it('transitionId description hints at how to discover IDs', () => {
    const issueSchema = toolSchemas.manage_jira_issue;
    const prop = issueSchema.inputSchema.properties.transitionId as { description: string };
    expect(prop.description).toContain('expand');
    expect(prop.description).toContain('transitions');
  });

  it('linkType description references issue-link-types resource', () => {
    const issueSchema = toolSchemas.manage_jira_issue;
    const prop = issueSchema.inputSchema.properties.linkType as { description: string };
    expect(prop.description).toContain('jira://issue-link-types');
  });
});
