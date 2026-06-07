---
name: documentation
description: Generate, update, or review project documentation for Astra. Use when the user needs to write docs, update README, create API documentation, or ensure docs stay in sync with code.
---

# Documentation Skill

This skill helps create and maintain Astra project documentation.

## Documentation Files

| File | Purpose |
|------|---------|
| `README.md` | Project overview, quickstart, and usage |
| `DOCUMENTATION.md` | Comprehensive documentation |
| `CHANGELOG.md` | Version history and release notes |
| `CONTRIBUTING.md` | Contribution guidelines (if exists) |

## Documentation Standards

### README.md Should Include
1. **Project name and description** — what is Astra?
2. **Installation** — how to install (bun install)
3. **Quick Start** — minimal example to get running
4. **Features** — key capabilities (Agent, Ask, Plan modes)
5. **Configuration** — environment variables and options
6. **License** — MIT

### Code Documentation
- Use TSDoc comments for public APIs
- Include `@param` and `@returns` for functions
- Add `@example` for complex functions
- Keep comments focused on "why", not "what"

### CHANGELOG.md Format
Follow [Keep a Changelog](https://keepachangelog.com/):

```markdown
## [Unreleased]

### Added
- New features

### Changed
- Changes to existing functionality

### Fixed
- Bug fixes

### Removed
- Deprecated features

## [0.1.2] - 2026-01-15
- Specific changes for this version
```

## How to Use This Skill

1. **Identify what needs documenting** — new feature, bug fix, or structural change
2. **Read the relevant source files** to understand the current behavior
3. **Update the appropriate doc file** — keep it concise and accurate
4. **Cross-reference** — ensure README and DOCUMENTATION stay in sync
5. **Review** — check for typos, broken links, and outdated information
