---
name: code-review
description: Perform a thorough code review of the Astra project. Use when the user asks to review code, check for quality issues, find bugs, or validate changes before merging.
---

# Code Review Skill

This skill performs a structured code review of the Astra project.

## Review Checklist

### 1. Code Quality
- Check for consistent naming conventions (camelCase for variables/functions, PascalCase for types)
- Verify proper TypeScript typing — no `any` types unless justified
- Look for code duplication and opportunities to abstract
- Ensure functions are small and single-purpose

### 2. Error Handling
- Verify all async operations have proper error handling
- Check that the retry engine (`core/retry/`) is used where appropriate
- Ensure error messages are descriptive and actionable

### 3. Security
- Check for hardcoded secrets or API keys
- Validate that `.env` files are in `.gitignore`
- Ensure user input is sanitized where applicable

### 4. Performance
- Look for unnecessary re-renders or redundant computations
- Check for memory leaks (unclosed streams, event listeners)
- Verify efficient use of async/await patterns

### 5. Testing
- Ensure new code has corresponding tests in `tests/`
- Check that edge cases are covered
- Verify test descriptions are clear and descriptive

## Review Output Format

Present findings as:

```
## Code Review Results

### 🔴 Critical Issues
[List blocking issues]

### 🟡 Warnings
[List non-blocking concerns]

### 🟢 Suggestions
[List improvements and nice-to-haves]

### ✅ What Went Well
[List positive observations]
```

## How to Use

1. Run `git diff` or `git diff --staged` to see recent changes
2. Read the changed files using `read_file` or `read_multiple_files`
3. Apply the checklist above
4. Present findings in the output format specified
