# Release Runbook

How to ship a new version of jira-cloud-mcp.

## What Happens on Release

A single `git tag` push triggers two CI workflows:

| Workflow | File | What it does |
|----------|------|-------------|
| **Publish to npm** | `.github/workflows/npm-publish.yml` | Builds, tests, publishes to npm with provenance |
| **Build .mcpb** | `.github/workflows/release-mcpb.yml` | Builds .mcpb bundle, creates GitHub Release, attaches artifact |

Both trigger on `push: tags: ['v*']`.

The .mcpb is platform-agnostic (pure Node.js/TypeScript, no native modules) so only one bundle is needed.

## Release Flow

### 1. Ensure main is clean

```bash
git checkout main && git pull
make check          # lint + tests + build must pass
```

### 2. Bump version

```bash
# Pick one:
make release-patch  # x.y.Z — bug fixes
make release-minor  # x.Y.0 — new features
make release-major  # X.0.0 — breaking changes
```

`make release-*` runs `check`, bumps `package.json`, syncs version to `server.json` + `mcpb/manifest.json`, commits, tags, and pushes. CI takes over from there.

### 3. Manual release (if make fails)

If `make release-*` fails partway through, complete manually:

```bash
npm version minor --no-git-tag-version   # or patch/major
make version-sync                         # sync to server.json + mcpb/manifest.json
git add package.json package-lock.json server.json mcpb/manifest.json
git commit -m "chore: release vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push && git push --tags
```

### 4. Verify CI

```bash
gh run list --limit 3   # should show both workflows running
gh run watch <run-id>   # watch progress
```

Check:
- npm publish: green, published to correct tag
- .mcpb build: green, artifact attached to GitHub Release

### 5. Verify artifacts

```bash
# npm
npm view @aaronsb/jira-cloud-mcp version

# GitHub Release
gh release view vX.Y.Z
```

The GitHub Release should have:
- `jira-cloud-mcp.mcpb` — platform-agnostic bundle for Claude Desktop

## Retagging

If a tag was pushed before a fix was ready:

```bash
git tag -d vX.Y.Z                        # delete local tag
git push origin :refs/tags/vX.Y.Z        # delete remote tag
# fix the issue, commit, push
git tag -a vX.Y.Z -m "vX.Y.Z"           # retag on fixed commit
git push --tags                           # triggers CI again
```

## Local .mcpb Builds

For testing or manual distribution without CI:

```bash
make mcpb              # builds jira-cloud-mcp.mcpb locally
```

Requires `mcpb` CLI installed (`npm install -g @anthropic-ai/mcpb`).

## Version Files

The version lives in three places, kept in sync by `make version-sync`:

| File | Field | Purpose |
|------|-------|---------|
| `package.json` | `version` | Source of truth, npm |
| `server.json` | `version` | MCP server metadata / registry |
| `mcpb/manifest.json` | `version` | .mcpb bundle metadata |

Never edit these manually — use `npm version` + `make version-sync`.

## Publishing to MCP Registry

Registry publishing is separate from the release flow:

```bash
make publish-all       # prompts, then publishes to registry + uploads .mcpb
```

This is manual because registry publishing requires GitHub auth and is not automated in CI.
