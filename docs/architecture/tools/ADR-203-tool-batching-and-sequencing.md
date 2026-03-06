---
status: Draft
date: 2026-03-06
deciders:
  - aaronsb
related:
  - ADR-200
  - ADR-202
---

# ADR-203: Tool Batching and Sequencing

## Context

Each MCP tool call is a round trip: the LLM generates a call, the server executes it, the result returns, and the LLM decides what to do next. For multi-step workflows — "create an issue, link it to PROJ-100, add a comment, then transition it to In Progress" — this means 4 round trips with the LLM re-evaluating after each one.

LLMs are good at planning sequences. If the LLM can express the full intent in a single call, the server can execute it as a batch, returning all results at once. This is faster, cheaper (fewer tokens), and lets the LLM reason about the plan holistically rather than step-by-step.

ADR-200 principle 6 identified this as a deferred capability. ADR-202 established guardrails for bulk-destructive operations. This ADR defines how batching works and how it integrates with those guardrails.

## Decision

### The Batch Tool

A new tool `batch_jira_operations` accepts an ordered list of operations. Each operation is a standard tool call (tool name + arguments) with an error strategy.

```json
{
  "operations": [
    {
      "tool": "manage_jira_issue",
      "args": { "operation": "create", "projectKey": "PROJ", "summary": "New task", "issueType": "Task" },
      "onError": "bail"
    },
    {
      "tool": "manage_jira_issue",
      "args": { "operation": "link", "issueKey": "$0.key", "linkedIssueKey": "PROJ-100", "linkType": "relates to" },
      "onError": "bail"
    },
    {
      "tool": "manage_jira_issue",
      "args": { "operation": "comment", "issueKey": "$0.key", "comment": "Created via batch" },
      "onError": "continue"
    },
    {
      "tool": "manage_jira_issue",
      "args": { "operation": "transition", "issueKey": "$0.key", "transitionId": "21" },
      "onError": "bail"
    }
  ]
}
```

### Error Strategies

Each operation declares how failure is handled:

| Strategy | Behavior |
|----------|----------|
| `bail` | Stop the batch. Skip all remaining operations. This is the default. |
| `continue` | Log the failure, proceed to the next operation. |

Strategies are per-operation, not per-batch. This allows mixing: bail on a critical create, continue past a non-critical comment.

### Result References

Operations can reference results from earlier operations in the same batch using `$N` syntax, where N is the zero-based index:

- `$0.key` — the `key` field from the first operation's result
- `$1.id` — the `id` field from the second operation's result

If a referenced operation failed or was skipped, the referencing operation also fails (regardless of its own `onError` strategy). This prevents cascading nonsense.

### Hard Cap

**Maximum 10 operations per batch.** This is a fixed limit, not configurable. Rationale:

- 10 is enough for any reasonable multi-step workflow (create + link + comment + transition + assign = 5)
- Beyond 10, the LLM is likely iterating over a list, not sequencing a workflow — that's bulk territory
- Keeps server-side execution bounded and predictable

### Integration with ADR-202 Guardrails

Destructive operations inside a batch count against ADR-202's sliding window:

- A batch containing 3 delete operations counts as 3 deletes in the window
- If the batch would exceed the `JIRA_BULK_DESTRUCTIVE_LIMIT`, the **entire batch is refused** before execution — not partway through
- The server scans the batch for destructive operations before executing any of them

This means:
- A batch of 3 creates + 1 delete = fine (1 delete, within limit)
- A batch of 4 deletes with `JIRA_BULK_DESTRUCTIVE_LIMIT=3` = refused with JQL + URL deflection
- The pre-scan prevents partial execution of a batch that would be refused mid-flight

### Response Format

The response is an ordered list matching the input, with status per operation:

```json
{
  "results": [
    { "index": 0, "status": "success", "result": { "key": "PROJ-456" } },
    { "index": 1, "status": "success", "result": { "linked": true } },
    { "index": 2, "status": "error", "error": "Comment body was empty", "continued": true },
    { "index": 3, "status": "success", "result": { "transitioned": true } }
  ],
  "summary": "3 succeeded, 1 failed (continued), 0 skipped"
}
```

On bail:

```json
{
  "results": [
    { "index": 0, "status": "success", "result": { "key": "PROJ-456" } },
    { "index": 1, "status": "error", "error": "Issue PROJ-100 not found", "bailed": true },
    { "index": 2, "status": "skipped", "reason": "Bailed at operation 1" },
    { "index": 3, "status": "skipped", "reason": "Bailed at operation 1" }
  ],
  "summary": "1 succeeded, 1 failed (bailed), 2 skipped"
}
```

### What Can Be Batched

Any existing tool call can appear in a batch. The batch tool is a meta-tool that wraps the existing tools:

- `manage_jira_issue` — all operations
- `manage_jira_filter` — all operations
- `manage_jira_sprint` — all operations
- `manage_jira_project` — get, list only (per ADR-202)
- `manage_jira_board` — get, list only (per ADR-202)

Cross-domain batches are allowed — create an issue, then add it to a sprint, then execute a JQL query to verify.

### Next-Step Guidance

After a batch completes, the response includes consolidated next-step guidance based on the final state, not intermediate steps. If the batch created an issue and transitioned it, the guidance reflects the transitioned state.

## Consequences

### Positive

- Multi-step workflows execute in a single round trip — faster, fewer tokens, less LLM re-evaluation
- Error strategies give the LLM fine-grained control over failure handling
- Result references enable dependent operations without intermediate LLM reasoning
- Pre-scan catches destructive batches before any operations execute
- The 10-operation cap prevents abuse while covering all reasonable workflows

### Negative

- Adds a new tool to the server's surface area — LLMs must learn when to use batch vs individual calls
- Result reference syntax (`$0.key`) adds complexity to the tool schema
- Debugging failed batches is harder than debugging individual calls — the response format helps but isn't as clean as single-operation errors
- The pre-scan means a batch with 1 invalid destructive operation blocks the entire batch, including its non-destructive operations

### Neutral

- The batch tool doesn't enable anything new — every operation was already available individually. It's purely an efficiency mechanism.
- LLMs that don't understand batching can ignore it entirely and use individual calls
- The 10-operation cap may need revisiting if legitimate workflows consistently hit it — but start conservative

## Alternatives Considered

- **No batching, let the LLM make individual calls**: Works today, but wastes tokens and latency on multi-step workflows. A 4-step workflow costs 4 round trips when 1 would suffice.
- **Unlimited batch size**: Dangerous — becomes a vector for bulk operations that bypass the spirit of ADR-202's guardrails. The cap of 10 forces the LLM to express intent as workflows, not bulk iterations.
- **Single error strategy per batch**: Too coarse. "Bail on everything if the comment fails" is different from "bail on everything if the create fails." Per-operation strategies give the LLM the control it needs.
- **Automatic rollback on bail**: Attractive but impractical — Jira operations aren't transactional. You can't un-create an issue or un-transition it to its previous state. Bail means "stop doing more damage," not "undo what happened."
- **Parallel execution within a batch**: Tempting for independent operations, but result references create ordering dependencies. Sequential execution is simpler and predictable. If the LLM wants parallelism, it can make multiple individual tool calls in one message (which MCP already supports).
