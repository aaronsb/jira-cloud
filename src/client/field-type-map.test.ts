import { describe, it, expect } from 'vitest';
import { classifyFieldType, categoryLabel } from './field-type-map.js';

describe('classifyFieldType', () => {
  it('classifies float custom URI as number', () => {
    const result = classifyFieldType('number', 'com.atlassian.jira.plugin.system.customfieldtypes:float');
    expect(result.category).toBe('number');
    expect(result.writable).toBe(true);
    expect(result.jsonSchema).toEqual({ type: 'number' });
  });

  it('classifies textfield as string', () => {
    const result = classifyFieldType('string', 'com.atlassian.jira.plugin.system.customfieldtypes:textfield');
    expect(result.category).toBe('string');
    expect(result.writable).toBe(true);
  });

  it('classifies textarea as string', () => {
    const result = classifyFieldType('string', 'com.atlassian.jira.plugin.system.customfieldtypes:textarea');
    expect(result.category).toBe('string');
  });

  it('classifies datepicker as date', () => {
    const result = classifyFieldType('date', 'com.atlassian.jira.plugin.system.customfieldtypes:datepicker');
    expect(result.category).toBe('date');
    expect(result.jsonSchema).toEqual({ type: 'string', format: 'date' });
  });

  it('classifies datetime', () => {
    const result = classifyFieldType('datetime', 'com.atlassian.jira.plugin.system.customfieldtypes:datetime');
    expect(result.category).toBe('datetime');
  });

  it('classifies select as single-select', () => {
    const result = classifyFieldType('option', 'com.atlassian.jira.plugin.system.customfieldtypes:select');
    expect(result.category).toBe('single-select');
  });

  it('classifies radiobuttons as single-select', () => {
    const result = classifyFieldType('option', 'com.atlassian.jira.plugin.system.customfieldtypes:radiobuttons');
    expect(result.category).toBe('single-select');
  });

  it('classifies multiselect as multi-select', () => {
    const result = classifyFieldType('array', 'com.atlassian.jira.plugin.system.customfieldtypes:multiselect', 'option');
    expect(result.category).toBe('multi-select');
  });

  it('classifies multicheckboxes as multi-select', () => {
    const result = classifyFieldType('array', 'com.atlassian.jira.plugin.system.customfieldtypes:multicheckboxes', 'option');
    expect(result.category).toBe('multi-select');
  });

  it('classifies userpicker as user', () => {
    const result = classifyFieldType('user', 'com.atlassian.jira.plugin.system.customfieldtypes:userpicker');
    expect(result.category).toBe('user');
    expect(result.writable).toBe(true);
  });

  it('classifies multiuserpicker as multi-user', () => {
    const result = classifyFieldType('array', 'com.atlassian.jira.plugin.system.customfieldtypes:multiuserpicker', 'user');
    expect(result.category).toBe('multi-user');
  });

  it('classifies labels', () => {
    const result = classifyFieldType('array', 'com.atlassian.jira.plugin.system.customfieldtypes:labels', 'string');
    expect(result.category).toBe('labels');
  });

  it('classifies url', () => {
    const result = classifyFieldType('string', 'com.atlassian.jira.plugin.system.customfieldtypes:url');
    expect(result.category).toBe('url');
    expect(result.jsonSchema).toEqual({ type: 'string', format: 'uri' });
  });

  it('classifies cascadingselect as unsupported', () => {
    const result = classifyFieldType('option', 'com.atlassian.jira.plugin.system.customfieldtypes:cascadingselect');
    expect(result.category).toBe('unsupported');
    expect(result.writable).toBe(false);
  });

  it('falls back to schema type when custom URI is unknown', () => {
    const result = classifyFieldType('number', 'com.some.thirdparty:weirdfield');
    expect(result.category).toBe('number');
  });

  it('falls back for array of options without custom URI', () => {
    const result = classifyFieldType('array', undefined, 'option');
    expect(result.category).toBe('multi-select');
  });

  it('falls back for array of users without custom URI', () => {
    const result = classifyFieldType('array', undefined, 'user');
    expect(result.category).toBe('multi-user');
  });

  it('returns unsupported for completely unknown types', () => {
    const result = classifyFieldType('any', 'com.unknown:exotic');
    expect(result.category).toBe('unsupported');
    expect(result.writable).toBe(false);
  });
});

describe('categoryLabel', () => {
  it('returns human-readable labels', () => {
    expect(categoryLabel('string')).toBe('text');
    expect(categoryLabel('single-select')).toBe('select');
    expect(categoryLabel('multi-select')).toBe('multi-select');
    expect(categoryLabel('unsupported')).toBe('unsupported');
  });
});
