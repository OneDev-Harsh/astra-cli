---
name: project-setup
description: Set up the Astra development environment from scratch. Use when the user needs to install dependencies, configure the project, or get started working on Astra for the first time.
---

# Project Setup Skill

This skill guides you through setting up the Astra project for local development.

## Prerequisites

- **Bun** (>= 1.0.0) — the project uses Bun as its runtime and package manager
- **Git** — for version control
- An **OpenRouter API key** — required for AI model access

## Setup Steps

1. **Clone the repository** (if not already cloned):
   ```bash
   git clone <repo-url>
   cd Astra
   ```

2. **Install dependencies**:
   ```bash
   bun install
   ```

3. **Configure environment**:
   - Copy `.env.example` to `.env` (if `.env.example` exists)
   - Add your `OPENROUTER_API_KEY` to the `.env` file

4. **Verify the setup**:
   ```bash
   bun run index.ts --help
   ```

5. **Run the test suite** to confirm everything works:
   ```bash
   bun test
   ```

## Project Structure Overview

| Directory | Purpose |
|-----------|---------|
| `ai/` | AI provider integrations and model configurations |
| `bin/` | CLI entry point (`astra` command) |
| `core/` | Core utilities (retry engine, error classification) |
| `game/` | Game-related modules |
| `modes/` | Operational modes (Agent, Ask, Plan) |
| `session/` | Session management |
| `tui/` | Terminal UI components |
| `tests/` | Test files |
| `index.ts` | Main entry point |

## Common Issues

- **Bun not found**: Install from https://bun.sh
- **API key errors**: Ensure `OPENROUTER_API_KEY` is set in `.env`
- **TypeScript errors**: Run `bun install` to ensure all `@types` packages are present
