---
status: Accepted
date: 2026-03-05
deciders:
  - aaronsb
related: []
---

# ADR-200: LLM-Facing Tool Design Principles

## Context

MCP tools are consumed by LLMs, not humans. The design assumptions that work for
human-facing REST APIs (raw JSON responses, exhaustive parameter documentation,
flat endpoint lists) actively harm LLM tool selection and usage.

This server consolidates Jira operations into 5 tools (`manage_jira_issue`,
`manage_jira_filter`, `manage_jira_project`, `manage_jira_board`,
`manage_jira_sprint`). The question is how to design these tools so LLMs
consistently pick the right tool, call it correctly on the first attempt, and
understand what to do next.

Observations from real usage:

- LLMs struggle with generic descriptions like "Board management with CRUD
  operations and related data" — they don't signal *when* to pick the tool.
- Verbose parameter descriptions waste context window on every tool listing.
- Raw JSON responses force the LLM to parse and reformat before presenting to
  the user, burning tokens and introducing errors.
- Without next-step guidance, LLMs often stop after a single operation instead
  of completing multi-step workflows.

## Decision

Adopt six principles for all LLM-facing tool design in this server:

### 1. Clean Content Return

Return human-readable formatted text, not raw JSON. Use markdown rendering
for structured data (tables, headers, lists). The LLM should be able to relay
responses to the user without reformatting.

**Example**: An issue `get` returns a formatted markdown block with key fields,
not a nested JSON object with 40+ Jira API fields.

### 2. Simple Parameters (CLI-style)

Parameters should feel like CLI flags — flat, obvious, minimal. Avoid nested
objects, complex typing, or parameters that require reading documentation to
understand. Snake_case and camelCase both accepted via `normalizeArgs()`.

**Example**: `{ operation: "create", projectKey: "PROJ", summary: "Fix bug", issueType: "Bug" }`
not `{ operation: "create", fields: { project: { key: "PROJ" }, summary: "Fix bug", issuetype: { name: "Bug" } } }`

### 3. Contextual Next-Step Guidance

Responses include suggested next actions based on what just happened and the
current state of the entity.

**Example**: After creating an issue, suggest: "Transition to In Progress with
`manage_jira_issue { operation: 'transition', issueKey: 'PROJ-123' }`" or
"Add to sprint with `manage_jira_sprint { operation: 'manage_issues' }`".

### 4. Progressive Disclosure

Tool descriptions tell the LLM *when* to pick the tool, not *how* to use every
parameter. Detailed documentation lives in MCP resources
(`jira://tools/{name}/documentation`) that the LLM can read on demand.

Top-level descriptions are action-oriented:
- "Get, create, update, transition, comment on, or link Jira issues"
- "Search for issues using JQL queries, or manage saved filters"

Parameter descriptions are terse — no "Can also use snake_case" on every field.

### 5. Elicitation via Resources

For complex operations, guide the LLM to read a resource before making the call.
This ensures it has the right context (available statuses, link types, project
metadata) to construct a correct call on the first attempt.

**Example**: Before linking issues, read `jira://issue-link-types` to discover
valid link type names. Before creating an issue in a project, read
`jira://projects/PROJ/overview` to discover available issue types and statuses.

### 6. Tool Bundling / Sequencing (Future)

A meta-tool that accepts a list of operations to execute in sequence, with
per-step failure handling (`fail-continue` or `fail-bail`). Reduces round-trips
for multi-step workflows like "create issue, transition to In Progress, add to
current sprint."

This is the most complex principle and will be designed in a separate ADR when
implementation begins.

## Consequences

### Positive

- LLMs pick the right tool more reliably with action-oriented descriptions
- First-attempt success rate improves with simpler parameters and elicitation
- Token usage drops with clean content return (no parse-and-reformat cycle)
- Multi-step workflows complete naturally with next-step guidance
- Detailed docs available on demand without bloating every tool listing

### Negative

- Clean content return means the server does more formatting work
- Next-step guidance requires domain knowledge in handlers (not just API
  forwarding)
- Progressive disclosure means some LLM clients that don't support MCP
  resources lose access to detailed documentation

### Neutral

- Principles 1-5 can be implemented incrementally; each delivers value alone
- Principle 6 (bundling) is deferred and will need its own ADR
- These principles apply to this server specifically, not to MCP servers in
  general, though they may generalize

## Alternatives Considered

- **Raw JSON responses with schema descriptions**: Standard REST API approach.
  Rejected because LLMs waste tokens reformatting and often hallucinate field
  names from similar APIs.

- **One tool per operation** (e.g., `create_jira_issue`, `get_jira_issue`):
  Previously used in this server. Rejected because it creates 20+ tools that
  overwhelm tool selection. The consolidated 5-tool approach with `operation`
  parameter is a better balance.

- **GraphQL-style field selection**: Considered for responses. Rejected as
  over-engineering — the `expand` parameter on specific operations achieves
  the same goal more simply.
