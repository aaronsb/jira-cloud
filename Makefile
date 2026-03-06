.PHONY: build test lint fix clean check inspect publish mcpb release-patch release-minor release-major help

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

release-patch: check  ## Bump patch version, tag, and push (0.2.7 → 0.2.8)
	@echo "Current version: $$(node -p 'require("./package.json").version')"
	npm version patch --no-git-tag-version
	@echo "New version: $$(node -p 'require("./package.json").version')"
	@echo ""
	@echo "TODO before publishing:"
	@echo "  1. Update CHANGELOG or commit message with release notes"
	@echo "  2. git add -A && git commit -m 'chore: release v$$(node -p \"require(\\\"./package.json\\\").version\")'"
	@echo "  3. git tag v$$(node -p 'require("./package.json").version')"
	@echo "  4. git push && git push --tags"
	@echo "  5. make publish  (or let the GitHub Action handle it)"

release-minor: check  ## Bump minor version, tag, and push (0.2.x → 0.3.0)
	@echo "Current version: $$(node -p 'require("./package.json").version')"
	npm version minor --no-git-tag-version
	@echo "New version: $$(node -p 'require("./package.json").version')"
	@echo ""
	@echo "TODO before publishing:"
	@echo "  1. Update CHANGELOG or commit message with release notes"
	@echo "  2. git add -A && git commit -m 'chore: release v$$(node -p \"require(\\\"./package.json\\\").version\")'"
	@echo "  3. git tag v$$(node -p 'require("./package.json").version')"
	@echo "  4. git push && git push --tags"
	@echo "  5. make publish  (or let the GitHub Action handle it)"

release-major: check  ## Bump major version (breaking changes)
	@echo "Current version: $$(node -p 'require("./package.json").version')"
	npm version major --no-git-tag-version
	@echo "New version: $$(node -p 'require("./package.json").version')"
	@echo ""
	@echo "TODO before publishing:"
	@echo "  1. Update CHANGELOG or commit message with release notes"
	@echo "  2. git add -A && git commit -m 'chore: release v$$(node -p \"require(\\\"./package.json\\\").version\")'"
	@echo "  3. git tag v$$(node -p 'require("./package.json").version')"
	@echo "  4. git push && git push --tags"
	@echo "  5. make publish  (or let the GitHub Action handle it)"

mcpb: build     ## Build .mcpb desktop extension bundle
	rm -rf mcpb/server mcpb/package-lock.json
	mkdir -p mcpb/server
	cp -r build/* mcpb/server/
	cp package.json mcpb/server/package.json
	cd mcpb/server && npm install --production --ignore-scripts --silent
	rm -f mcpb/server/package.json mcpb/server/package-lock.json
	mcpb pack mcpb jira-cloud-mcp.mcpb
	@echo ""
	@echo "Built: jira-cloud-mcp.mcpb ($$(du -h jira-cloud-mcp.mcpb | cut -f1))"

publish:        ## Publish to npm (use after release-*)
	npm publish --access public

help:           ## Show this help
	@grep -E '^[a-z_-]+:.*##' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-16s %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
