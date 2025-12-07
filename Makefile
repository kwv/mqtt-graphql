.PHONY: all build dev test bump

all: build

build:
	npm run build

dev:
	npm run dev

test:
	npm test

# Bump version, commit, tag, and push
bump:
	npm version patch
	git push --follow-tags
