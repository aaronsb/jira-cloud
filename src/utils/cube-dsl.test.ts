import { describe, it, expect } from 'vitest';
import { parseComputeExpr, parseComputeList, evaluateRow, extractColumnRefs } from './cube-dsl.js';

// ── Parsing ──────────────────────────────────────────────────────────

describe('parseComputeExpr', () => {
  it('parses simple assignment', () => {
    const result = parseComputeExpr('bug_pct = bugs / total * 100');
    expect(result.name).toBe('bug_pct');
    expect(result.expr).toBe('bugs / total * 100');
  });

  it('handles expressions with comparison operators', () => {
    const result = parseComputeExpr('on_track = overdue == 0');
    expect(result.name).toBe('on_track');
    expect(result.expr).toBe('overdue == 0');
  });

  it('handles != operator without confusing with assignment', () => {
    const result = parseComputeExpr('has_bugs = bugs != 0');
    expect(result.name).toBe('has_bugs');
    expect(result.expr).toBe('bugs != 0');
  });

  it('handles >= and <= operators', () => {
    const r1 = parseComputeExpr('high_risk = overdue >= 10');
    expect(r1.expr).toBe('overdue >= 10');
    const r2 = parseComputeExpr('low_risk = overdue <= 2');
    expect(r2.expr).toBe('overdue <= 2');
  });

  it('rejects missing equals', () => {
    expect(() => parseComputeExpr('no_equals_here')).toThrow('missing "="');
  });

  it('rejects invalid column name', () => {
    expect(() => parseComputeExpr('123bad = total')).toThrow('Invalid column name');
  });

  it('rejects empty expression', () => {
    expect(() => parseComputeExpr('empty = ')).toThrow('Empty expression');
  });

  it('accepts underscored names', () => {
    const result = parseComputeExpr('net_flow = created_7d - resolved_7d');
    expect(result.name).toBe('net_flow');
  });
});

describe('parseComputeList', () => {
  it('parses multiple expressions', () => {
    const result = parseComputeList([
      'bug_pct = bugs / total * 100',
      'clearing = resolved_7d > created_7d',
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('bug_pct');
    expect(result[1].name).toBe('clearing');
  });

  it('rejects duplicate column names', () => {
    expect(() => parseComputeList([
      'x = total + 1',
      'x = total + 2',
    ])).toThrow('Duplicate column name');
  });

  it('rejects more than 5 expressions', () => {
    const exprs = Array.from({ length: 6 }, (_, i) => `col${i} = total + ${i}`);
    expect(() => parseComputeList(exprs)).toThrow('Too many compute expressions');
  });

  it('accepts exactly 5 expressions', () => {
    const exprs = Array.from({ length: 5 }, (_, i) => `col${i} = total + ${i}`);
    expect(parseComputeList(exprs)).toHaveLength(5);
  });
});

// ── Evaluation ───────────────────────────────────────────────────────

describe('evaluateRow', () => {
  const baseRow = new Map<string, number>([
    ['total', 100],
    ['open', 80],
    ['overdue', 5],
    ['high', 10],
    ['created_7d', 12],
    ['resolved_7d', 8],
    ['bugs', 15],
  ]);

  it('evaluates arithmetic: percentage', () => {
    const cols = parseComputeList(['bug_pct = bugs / total * 100']);
    const results = evaluateRow(cols, baseRow);
    expect(results[0].name).toBe('bug_pct');
    expect(results[0].value).toBe(15);
  });

  it('evaluates subtraction: net flow', () => {
    const cols = parseComputeList(['net_flow = created_7d - resolved_7d']);
    const results = evaluateRow(cols, baseRow);
    expect(results[0].value).toBe(4);
  });

  it('evaluates comparison: produces Yes/No', () => {
    const cols = parseComputeList(['clearing = resolved_7d > created_7d']);
    const results = evaluateRow(cols, baseRow);
    expect(results[0].value).toBe('No'); // 8 > 12 is false
  });

  it('evaluates == comparison', () => {
    const cols = parseComputeList(['on_track = overdue == 0']);
    const results = evaluateRow(cols, baseRow);
    expect(results[0].value).toBe('No'); // overdue is 5
  });

  it('evaluates == comparison as Yes', () => {
    const row = new Map([['overdue', 0]]);
    const cols = parseComputeList(['on_track = overdue == 0']);
    const results = evaluateRow(cols, row);
    expect(results[0].value).toBe('Yes');
  });

  it('evaluates != comparison', () => {
    const cols = parseComputeList(['has_bugs = bugs != 0']);
    const results = evaluateRow(cols, baseRow);
    expect(results[0].value).toBe('Yes');
  });

  it('handles division by zero gracefully', () => {
    const row = new Map([['total', 0], ['bugs', 5]]);
    const cols = parseComputeList(['ratio = bugs / total']);
    const results = evaluateRow(cols, row);
    expect(results[0].value).toBe(0);
  });

  it('supports parentheses for grouping', () => {
    const row = new Map([['a', 2], ['b', 3], ['c', 4]]);
    const cols = parseComputeList(['result = (a + b) * c']);
    const results = evaluateRow(cols, row);
    expect(results[0].value).toBe(20);
  });

  it('references earlier computed columns', () => {
    const cols = parseComputeList([
      'net_flow = created_7d - resolved_7d',
      'growing = net_flow > 0',
    ]);
    const results = evaluateRow(cols, baseRow);
    expect(results[0].value).toBe(4);
    expect(results[1].value).toBe('Yes'); // 4 > 0
  });

  it('boolean results stored as 1/0 for downstream', () => {
    const row = new Map([['overdue', 5], ['total', 100]]);
    const cols = parseComputeList([
      'risky = overdue > 0',
      'risk_score = risky * total',
    ]);
    const results = evaluateRow(cols, row);
    expect(results[0].value).toBe('Yes');
    expect(results[1].value).toBe(100); // 1 * 100
  });

  it('throws on unknown column', () => {
    const cols = parseComputeList(['x = nonexistent + 1']);
    expect(() => evaluateRow(cols, baseRow)).toThrow('Unknown column: "nonexistent"');
  });

  it('respects operator precedence', () => {
    const row = new Map([['a', 2], ['b', 3], ['c', 4]]);
    const cols = parseComputeList(['result = a + b * c']);
    const results = evaluateRow(cols, row);
    expect(results[0].value).toBe(14); // 2 + (3 * 4), not (2 + 3) * 4
  });

  it('handles numeric literals', () => {
    const row = new Map([['total', 50]]);
    const cols = parseComputeList(['pct = total / 100']);
    const results = evaluateRow(cols, row);
    expect(results[0].value).toBe(0.5);
  });

  it('handles >= and <= comparisons', () => {
    const row = new Map([['x', 10]]);
    const cols = parseComputeList([
      'gte = x >= 10',
      'lte = x <= 10',
    ]);
    const results = evaluateRow(cols, row);
    expect(results[0].value).toBe('Yes');
    expect(results[1].value).toBe('Yes');
  });
});

// ── Column Reference Extraction ──────────────────────────────────────

describe('extractColumnRefs', () => {
  it('extracts identifiers from expressions', () => {
    const cols = parseComputeList([
      'bug_pct = bugs / total * 100',
      'clearing = resolved_7d > created_7d',
    ]);
    const refs = extractColumnRefs(cols);
    expect(refs).toContain('bugs');
    expect(refs).toContain('total');
    expect(refs).toContain('resolved_7d');
    expect(refs).toContain('created_7d');
    expect(refs).not.toContain('bug_pct'); // left-hand side not in expr
  });

  it('does not include numeric literals', () => {
    const cols = parseComputeList(['x = total * 100']);
    const refs = extractColumnRefs(cols);
    expect(refs).toContain('total');
    expect(refs.size).toBe(1);
  });
});
