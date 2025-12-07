.PHONY: all build dev test bump

all: build

build:
	bun build src/index.ts --compile --outfile=dist/server

dev:
	bun run --watch src/index.ts

test:
	bun test

# Bump version, commit, tag, and push
bump:
	bun version patch
	git push --follow-tags
