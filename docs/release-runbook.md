# Release Runbook

How to ship a new version of jira-cloud-mcp.

## What Happens on Release

Pushing a `v*` tag triggers two CI workflows, publishing three channels:

| Workflow | File | What it does |
|----------|------|-------------|
| **Build .mcpb** | `.github/workflows/release-mcpb.yml` | Builds the .mcpb bundle and attaches it to the GitHub Release |
| **Publish** | `.github/workflows/npm-publish.yml` | Publishes to npm, then to the MCP Registry |

**Nothing needs publishing by hand.** Both npm and the MCP Registry go out from CI by
OIDC (see issue #60 and google-workspace-mcp ADR-105) — no `NPM_TOKEN`, no secret to
rotate. The registry job `needs` the npm job, because `server.json` advertises the npm
package at that version and publishing the registry entry first would point people at a
tarball that does not exist yet.

The workflow picks the npm dist-tag itself: any semver pre-release (anything after `-`
in the version) publishes under its identifier — `alpha`, `beta`, `rc`, `pre`, `next` —
never `latest`, or every `npm install` and every `^x.y.z` range picks it up.

`make publish-all` still exists for publishing by hand if CI is unavailable. It is not
the normal path, and it runs the same identity gate and the same idempotent registry
publish as CI, so running it after a half-succeeded CI run finishes what is missing
instead of double-publishing.

### Trusted publishing setup (one-time, before the first tagged release)

npmjs.com registers the trusted publisher against this repository AND the workflow
**filename** `npm-publish.yml`. Renaming or moving that file breaks publishing with a
401 that says nothing about OIDC. The registration lives at
npmjs.com → package → Settings → Trusted Publishers.

## Release Flow

### 1. Ensure main is clean

```bash
git checkout main && git pull
make check          # lint + test + build must pass
```

### 2. Bump version

```bash
# Pick one:
make release-patch  # x.y.Z — bug fixes
make release-minor  # x.Y.0 — new features
make release-major  # X.0.0 — breaking changes
```

`make release-*` runs `check`, bumps `package.json`, syncs version to `server.json` +
`mcpb/manifest.json`, commits, tags, and pushes. CI takes over from there.

If `make check` fails (e.g., a flaky test), fix it first. Don't skip the check — fix
the test and commit before releasing.

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
gh run list --limit 3   # both the .mcpb build and the publish should be running
gh run watch <run-id>
```

Both workflows must be green. The publish workflow runs npm first and the MCP Registry
after it, so a red registry job on a green npm job means the package shipped and the
registry entry did not — those need checking separately in step 5.

### 5. Verify artifacts

Check the PUBLISHED artifact, not the repo it was built from — those are different
claims, and only one of them is what a user installs.

```bash
# npm — version, and the dist-tag it landed under
npm view @aaronsb/jira-cloud-mcp version dist-tags

# GitHub Release
gh release view vX.Y.Z

# MCP Registry
curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.aaronsb/jira-cloud" | head -c 400
```

The GitHub Release should have exactly one `.mcpb` file: `jira-cloud-mcp.mcpb`.
One bundle covers every platform — what ships is Node plus pure JavaScript.

## Pre-release Versions

For alpha/beta/rc releases:

```bash
npm version preminor --preid alpha --no-git-tag-version
# → x.y.0-alpha.0
make version-sync
# commit, tag, push as above
```

CI derives the dist-tag from the pre-release identifier (`--tag alpha` for
`-alpha.0`, and likewise for any other identifier) rather than `--tag latest`, so a
pre-release is available to people who ask for it and invisible to everyone else.

## Retagging

If a tag was pushed before a fix was ready (e.g., tests failed in CI):

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
make mcpb              # the bundle — one, for every platform
```

Requires `mcpb` CLI installed (`npm install -g @anthropic-ai/mcpb`).

## Version Files

The version lives in three places, kept in sync by `make version-sync`:

| File | Field | Purpose |
|------|-------|---------|
| `package.json` | `version` | Source of truth, npm |
| `server.json` | `version` (twice — server entry AND `packages[0]`) | MCP server metadata / registry |
| `mcpb/manifest.json` | `version` | .mcpb bundle metadata |

Never edit these manually — use `npm version` + `make version-sync`.
`scripts/check-publish-identity.cjs` gates every publish path — both CI workflows and
`make publish-all` — on the tag, all three files, and `server.json` naming the npm
package this repo actually publishes.
