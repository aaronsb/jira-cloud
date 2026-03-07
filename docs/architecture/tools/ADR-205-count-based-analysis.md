---
status: Accepted
date: 2026-03-06
deciders:
  - aaronsb
related:
  - ADR-204
---

# ADR-205: Count-Based Analysis for Cross-Project Summaries

## Context

ADR-204 introduced `analyze_jira_issues` with 5 metric groups that fetch full issue payloads and compute metrics client-side. This works well for single-project analysis up to 500 issues, but breaks down for cross-project comparisons:

- A combined query like `project in (AA, GC, GD, LGS)` hits the 500-issue cap, producing biased samples
- Getting per-project breakdowns requires separate tool calls (4 projects = 4 calls)
- Each call fetches up to 500 issue payloads when often only counts are needed
- LLMs may misuse `manage_jira_filter` or `manage_jira_project` to answer quantitative questions, returning full issue lists instead of summaries

Jira's REST API provides a dedicated `POST /rest/api/3/search/count` endpoint that returns just a count for any JQL query — no issue data, no pagination.

## Decision

Add a `summary` metric group to `analyze_jira_issues` that uses count-only queries instead of issue fetching.

### How It Works

When `metrics: ["summary"]` is requested:

1. Parse the base JQL to identify the scope
2. Run multiple count queries in parallel to build a dashboard:
   - Total open issues
   - Overdue count (`dueDate < now() AND resolution = Unresolved`)
   - High priority count
   - Created last 7 days / 30 days
   - Resolved last 7 days / 30 days
3. If `groupBy` is provided (e.g., `"project"`), split the counts per group value

### `groupBy` Parameter

A new optional parameter that splits summary counts across a dimension:

```json
{
  "jql": "project in (AA, GC, GD, LGS) AND resolution = Unresolved",
  "metrics": ["summary"],
  "groupBy": "project"
}
```

This runs the count queries once per group value, producing a comparison table:

```
| Project | Open | Overdue | High | Created 7d | Resolved 7d |
|---------|------|---------|------|------------|-------------|
| AA      | 623  | 85      | 1    | 12         | 8           |
| LGS     | 384  | 32      | 47   | 5          | 3           |
| GD      | 31   | 3       | 0    | 0          | 1           |
| GC      | 27   | 4       | 0    | 2          | 0           |
```

Supported `groupBy` values: `project`, `assignee`, `priority`, `issuetype`.

For `project`, group values are extracted from the JQL `project in (...)` clause.
For other dimensions, a preliminary search (1 page) discovers the distinct values.

### Performance Budget

- Count query: ~50ms each (no data transfer)
- 4 projects × 6 count queries = 24 API calls
- Total: ~2-3 seconds vs. 10+ seconds fetching 500 issues per project
- Well within Jira rate limits (count endpoint is lightweight)

### Interaction With Other Metrics

`summary` can be combined with other metric groups. When combined:
- `summary` provides the high-level counts (always accurate, no cap)
- Other metrics (`points`, `schedule`, etc.) use the existing fetch-and-compute approach (subject to maxResults cap)

This gives the LLM a "zoom out, then zoom in" workflow.

## Tool Description Updates

Update tool descriptions to guide LLM tool selection:

- **`analyze_jira_issues`**: "Compute project metrics... Use `summary` for cross-project dashboards and issue counts without caps."
- **`manage_jira_filter`**: Add "For quantitative questions (counts, totals, overdue), use `analyze_jira_issues` instead."
- **`manage_jira_project`**: Add "For issue counts and workload analysis, use `analyze_jira_issues` instead."

## Consequences

### Positive
- Cross-project comparisons return accurate totals without caps
- Orders of magnitude faster for count-based questions
- LLMs get clear guidance on which tool to use for what
- "Zoom out then zoom in" workflow matches PM thinking

### Negative
- Count endpoint requires "bounded" JQL (must have a search restriction) — open-ended queries may fail
- `groupBy` adds query complexity and more API calls per group value
- Two different data paths (count vs. fetch) to maintain

### Risks
- Count endpoint may not be available on all Jira Cloud plans (verify)
- Rate limiting on count endpoint is unknown — monitor in practice
