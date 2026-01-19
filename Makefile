.PHONY: all build dev test bump

all: build

build:
	bun build src/index.ts --compile --outfile=dist/server

dev:
	bun run --watch src/index.ts

test:
	bun test

# Bump version, commit, tag, create PR
bump:
	@echo "Creating release branch and bumping version..."
	git checkout -b release-bump-$(shell date +%Y%m%d-%H%M%S)
	npm version patch
	git push origin HEAD --follow-tags
	gh pr create --fill --base main --title "chore: release v$$(node -p 'require(\"./package.json\").version')"
