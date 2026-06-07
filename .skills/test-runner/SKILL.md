---
name: test-runner
description: Run the Astra test suite and interpret results. Use when the user asks to run tests, check test results, debug failing tests, or validate that changes don't break existing functionality.
---

# Test Runner Skill

This skill runs and interprets the Astra project's test suite.

## Running Tests

### Full Test Suite
```bash
bun test
```

### Specific Test File
```bash
bun test tests/<test-file>.test.ts
```

### With Filter
```bun
bun test --filter "<pattern>"
```

## Test Structure

Tests are located in the `tests/` directory. The project uses Bun's built-in test runner (`bun:test`).

### Test File Naming Convention
- Unit tests: `*.test.ts`
- Integration tests: `*.integration.test.ts`

## Interpreting Results

### Passing Tests
- All assertions succeeded
- No action needed unless adding new features

### Failing Tests
1. Read the error message carefully — Bun provides file, line number, and expected vs actual
2. Open the failing test file and the source file it tests
3. Identify the root cause:
   - **Logic error**: The source code behavior changed
   - **Test drift**: The test expectations are outdated
   - **Environment issue**: Missing env vars, file paths, etc.
4. Fix the issue and re-run

### Flaky Tests
- If tests pass intermittently, check for:
  - Race conditions in async code
  - Time-dependent assertions
  - Shared mutable state between tests

## After Running Tests

Report results as:

```
## Test Results

- **Total**: X tests
- **Passed**: X ✅
- **Failed**: X ❌
- **Skipped**: X ⏭️

[Details of any failures with file:line references]
```
