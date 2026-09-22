import { describe, it, expect, vi } from 'vitest';
import { JiraClient } from './jira-client.js';

function clientWithStub(issue: Record<string, unknown>) {
  const jc = new JiraClient({ host: 'https://example.atlassian.net', email: 'a@b.c', apiToken: 'x' } as any);
  const getIssue = vi.fn().mockResolvedValue(issue);
  (jc as any).client = { issues: { getIssue } };
  return { jc, getIssue };
}

const baseIssue = {
  id: '1',
  key: 'PROJ-1',
  fields: {
    summary: 'S',
    status: { name: 'Open', statusCategory: { key: 'new' } },
    comment: {
      total: 1,
      comments: [{
        id: '10',
        author: { displayName: 'Ada', accountId: 'acc-1' },
        created: '2026-01-02T03:04:05.000+0000',
        body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }] },
      }],
    },
  },
};

describe('JiraClient.getIssue comments', () => {
  it('requests the comment field by name when comments are wanted', async () => {
    const { jc, getIssue } = clientWithStub(baseIssue);
    const details = await jc.getIssue('PROJ-1', true);
    const params = getIssue.mock.calls[0][0];
    expect(params.fields).toContain('comment');
    expect(params.expand).toBeUndefined();
    expect(details.comments).toHaveLength(1);
    expect(details.comments![0]).toMatchObject({ id: '10', author: 'Ada', body: 'hello' });
    expect(details.people).toContainEqual({ displayName: 'Ada', accountId: 'acc-1', role: 'commenter' });
  });

  it('leaves the comment field out when comments are not wanted', async () => {
    const { jc, getIssue } = clientWithStub(baseIssue);
    const details = await jc.getIssue('PROJ-1', false);
    expect(getIssue.mock.calls[0][0].fields).not.toContain('comment');
    expect(details.comments).toBeUndefined();
  });
});
