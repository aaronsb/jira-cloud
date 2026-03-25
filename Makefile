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
	git tag -a "v$(NEW_VERSION)" -m "v$(NEW_VERSION)"
	git push && git push --tags
	@echo ""
	@echo "── Building MCPB ──"
	$(MAKE) mcpb
	@echo ""
	@echo "── GitHub Release ──"
	gh release create "v$(NEW_VERSION)" --title "v$(NEW_VERSION)" --generate-notes jira-cloud-mcp.mcpb
	@echo ""
	@echo "v$(NEW_VERSION) released. npm auto-publishes via CI on tag push."

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

publish-all: mcpb  ## Manual publish: MCP Registry + upload MCPB to existing GitHub Release
	@echo ""
	@echo "Publishing v$(VERSION) — npm is handled by CI on tag push."
	@echo "  1. MCP Registry (requires GitHub auth)"
	@echo "  2. Upload MCPB to GitHub Release"
	@echo ""
	@read -p "Continue? [y/N] " confirm && [ "$$confirm" = "y" ] || (echo "Aborted." && exit 1)
	@echo ""
	@echo "── MCP Registry ──"
	mcp-publisher login github
	mcp-publisher publish server.json
	@echo ""
	@echo "── GitHub Release ──"
	gh release upload "v$(VERSION)" jira-cloud-mcp.mcpb --clobber
	@echo ""
	@echo "v$(VERSION) published."

help:           ## Show this help
	@grep -E '^[a-z_-]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-16s %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
