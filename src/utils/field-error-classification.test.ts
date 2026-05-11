import { describe, it, expect } from 'vitest';
import { classifyFieldErrors } from './field-error-classification.js';

describe('classifyFieldErrors', () => {
  it('routes a Sprint rejection to manage_jira_sprint', () => {
    const lines = classifyFieldErrors({
      Sprint: "Field 'Sprint' cannot be set. It is not on the appropriate screen, or unknown.",
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Sprint');
    expect(lines[0]).toContain('manage_jira_sprint');
  });

  it('routes Epic Link to the parent parameter', () => {
    const lines = classifyFieldErrors({ 'Epic Link': 'Field cannot be set.' });
    expect(lines[0]).toContain('"parent" parameter');
  });

  it('flags an unknown plain field name as not exposed by the instance', () => {
    const lines = classifyFieldErrors({ NotARealField: 'Field cannot be set.' });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/isn't a custom field this instance exposes/);
    expect(lines[0]).toContain('jira://custom-fields');
  });

  it('recognises a Connect/Forge app field key (e.g. io.tempo.jira__account)', () => {
    const lines = classifyFieldErrors({
      'io.tempo.jira__account': "Can not construct instance of java.lang.Long from String value 'PRAEAI-OPEX'",
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Connect/Forge app');
    expect(lines[0]).not.toMatch(/isn't a custom field this instance exposes/);
  });

  it('produces one guidance line per rejected field', () => {
    const lines = classifyFieldErrors({
      Sprint: 'x',
      Rank: 'y',
      Whatever: 'z',
    });
    expect(lines).toHaveLength(3);
  });
});
