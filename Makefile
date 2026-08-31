.PHONY: build test lint fix clean check inspect mcpb help
.PHONY: version-sync release-patch release-minor release-major publish-all

VERSION = $(shell node -p 'require("./package.json").version')

build:          ## Build TypeScript
	npm run build

test:           ## Run tests
	npx vitest run

test-watch:     ## Run tests in watch mode
	npx vitest

lint:           ## Run linter
	npm run lint

fix:            ## Run linter with auto-fix
	npm run lint:fix

check: lint test build  ## Lint, test, and build (CI gate)

clean:          ## Remove build output
	rm -rf build

inspect:        ## Launch MCP Inspector
	npm run inspector

# ── Version & Release ───────────────────────────────────────────────────

version-sync:   ## Sync version from package.json to server.json and mcpb/manifest.json
	@echo "Syncing version $(VERSION) to server.json and mcpb/manifest.json"
	node scripts/version-sync.cjs

release-patch: check  ## Bump patch, sync, commit, tag, push
	@echo "Current version: $(VERSION)"
	npm version patch --no-git-tag-version
	$(MAKE) version-sync
	$(MAKE) _release-commit

release-minor: check  ## Bump minor, sync, commit, tag, push
	@echo "Current version: $(VERSION)"
	npm version minor --no-git-tag-version
	$(MAKE) version-sync
	$(MAKE) _release-commit

release-major: check  ## Bump major, sync, commit, tag, push
	@echo "Current version: $(VERSION)"
	npm version major --no-git-tag-version
	$(MAKE) version-sync
	$(MAKE) _release-commit

_release-commit:
	$(eval NEW_VERSION := $(shell node -p 'require("./package.json").version'))
	git add package.json package-lock.json server.json mcpb/manifest.json
	git commit -m "chore: release v$(NEW_VERSION)"
	# Run the full publish-identity gate (including the registry's 100-char
	# description cap) BEFORE tagging — a violation caught in CI has already
	# burned a version number.
	node scripts/check-publish-identity.cjs "v$(NEW_VERSION)"
	git tag -a "v$(NEW_VERSION)" -m "v$(NEW_VERSION)"
	git push && git push --tags
	@echo ""
	@echo "v$(NEW_VERSION) released. CI publishes npm, the MCP Registry, and the GitHub Release with the .mcpb."

# ── Publishing ──────────────────────────────────────────────────────────

mcpb: build     ## Build .mcpb desktop extension bundle
	rm -rf mcpb/server mcpb/package-lock.json
	mkdir -p mcpb/server
	cp -r build/* mcpb/server/
	cp package.json mcpb/server/package.json
	cd mcpb/server && npm install --production --ignore-scripts --silent
	rm -f mcpb/server/package-lock.json
	mcpb pack mcpb jira-cloud-mcp.mcpb
	@echo ""
	@echo "Built: jira-cloud-mcp.mcpb ($$(du -h jira-cloud-mcp.mcpb | cut -f1))"

# CI publishes every channel on tag push (see .github/workflows/npm-publish.yml and
# release-mcpb.yml). This target is the fallback for when CI cannot do it, and
# it runs the same identity gate and idempotent registry publish as CI — a
# fallback runs precisely when something already went wrong, so it needs the
# guards more than CI does, and a half-succeeded CI run (registry published,
# upload failed) must not die on the duplicate registry publish before
# reaching the upload.
publish-all: mcpb  ## Manual fallback: registry + MCPB upload (CI does all of this on tag push)
	@echo ""
	@echo "Publishing v$(VERSION) manually — CI publishes npm, the registry, and the release on tag push."
	@echo "  1. MCP Registry (requires GitHub auth)"
	@echo "  2. Upload MCPB to GitHub Release"
	@echo ""
	@read -p "Continue? [y/N] " confirm && [ "$$confirm" = "y" ] || (echo "Aborted." && exit 1)
	node scripts/check-publish-identity.cjs "v$(VERSION)"
	@echo ""
	@echo "── MCP Registry ──"
	mcp-publisher login github
	bash scripts/mcp-registry-publish.sh
	@echo ""
	@echo "── GitHub Release ──"
	gh release upload "v$(VERSION)" jira-cloud-mcp.mcpb --clobber
	@echo ""
	@echo "v$(VERSION) published."

help:           ## Show this help
	@grep -E '^[a-z_-]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-16s %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
