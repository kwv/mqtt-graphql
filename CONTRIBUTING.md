# Contributing to **mqtt-graphql**

Thanks for your interest in contributing to **mqtt-graphql**!
This guide explains how to develop, build, test, and release new versions of the project.

------------------------------------------------------------------------

## 🛠️ Development Setup

### 1. Clone the Repository

``` sh
git clone https://github.com/kwv4/mqtt-graphql.git
cd mqtt-graphql
```

### 2. Local Development

This project uses **Bun**.

``` sh
bun install
```

### 3. Linting and Testing

``` sh
# Run lint (if available)
bun run lint

# Run tests
bun test

# Verify build
bun run build
```

------------------------------------------------------------------------

## 🚀 Releasing a New Version

The project uses a **PR-based release workflow** to ensure all changes are validated before publishing.

### Steps to Publish a New Version

1.  Ensure your local `main` branch is up to date:
    ``` sh
    git checkout main
    git pull
    ```

2.  Run the bump command to create a release PR:
    ``` sh
    make bump
    ```

    This will:
    - Create a timestamped release branch
    - Bump the patch version in `package.json`
    - Create a version commit and tag
    - Push to GitHub and create a PR

3.  Review the PR, wait for CI validation to pass, then merge.

4.  Once merged, the tag will be on `main` and trigger the Docker release automatically.

**Note:** The `main` branch is protected and requires PRs. All changes, including releases, must go through pull requests.

### 🤖 CI/CD Automation

The GitHub Actions workflows handle validation and releases:

- **Pull Requests**: The `validate` job runs lint, tests, and build checks.
- **Tag Push**: When a version tag reaches `main`, the `release` job runs full validation and builds/publishes the multi-arch Docker image:
    - `kwv4/mqtt-graphql:1.2.3` (semantic version)
    - `kwv4/mqtt-graphql:1.2` (major.minor)
    - `kwv4/mqtt-graphql:latest`
- **Dependabot**: When dependency PRs merge, `auto-release.yml` automatically creates a release PR that auto-merges after CI passes.

### 🧹 Tag Cleanup
The repository contains a weekly automated cleanup job (`docker-cleanup.yml`) that:
- Synchronizes Git tags and Docker Hub tags.
- Keeps the `latest` tag and the most recent semantic version tags (configured via `KEEP_RECENT`).
- Removes orphaned or old version tags from both systems.

------------------------------------------------------------------------

## 🧪 Testing Locally with Docker

To test the image before publishing:

``` sh
docker build -t mqtt-graphql:test .
docker run --rm mqtt-graphql:test
```

------------------------------------------------------------------------

## 🔄 Contribution Workflow

1. Create a branch for your changes (e.g., `feature/name` or `bugfix/name`).
2. Commit your changes.
3. Open a pull request (PR) targeting the `main` branch.
4. Ensure your PR includes a clear description.
5. Wait for CI validation to pass (the `validate` job will run tests and build checks).
6. Once approved and CI passes, merge your PR.

**Note:** Direct pushes to `main` are blocked by branch protection rules. All changes must go through PRs.

------------------------------------------------------------------------

## 🧩 Required Secrets for CI

Add these secrets in your GitHub repository settings:

| Secret Name | Value |
|-------------|-------|
| `DOCKERHUB_USER` | `kwv4` |
| `DOCKERHUB_TOKEN` | *Docker Hub access token* |

------------------------------------------------------------------------

## 💬 Questions?

Feel free to open an issue or start a discussion if you have questions or suggestions.
We welcome contributions of all kinds!
