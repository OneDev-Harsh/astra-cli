---
name: git-workflow
description: Manage git operations for the Astra project. Use when the user needs to create branches, commit changes, create pull requests, or follow the project's git conventions.
---

# Git Workflow Skill

This skill handles git operations following the Astra project's conventions.

## Branch Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feature/<description>` | `feature/add-retry-logic` |
| Bug fix | `fix/<description>` | `fix/session-timeout` |
| Release | `release/v<version>` | `release/v0.2.0` |
| Hotfix | `hotfix/<description>` | `hotfix/critical-auth-bug` |

## Commit Convention

Follow conventional commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`

**Examples**:
```
feat(retry): add exponential backoff strategy

fix(session): resolve memory leak in long-running sessions

test(core): add tests for error classifier
```

## Workflow Steps

### 1. Create a Branch
```bash
git checkout -b feature/my-feature
```

### 2. Stage and Commit
```bash
git add -A
git commit -m "feat(scope): description"
```

### 3. Push
```bash
git push -u origin feature/my-feature
```

### 4. Create Pull Request
- Use the PR template if available (`.github/PULL_REQUEST_TEMPLATE.md`)
- Link related issues
- Request review from maintainers

## Pre-commit Checklist

Before committing:
1. Run `bun test` — all tests must pass
2. Run `bun run index.ts` — verify the app starts
3. Check `git diff --staged` — review your own changes
4. Ensure no secrets or `.env` files are committed

## Useful Commands

```bash
# Check status
git status

# View recent commits
git log --oneline -10

# Discard local changes
git checkout -- .

# Stash changes temporarily
git stash
git stash pop
```
