# Astra CLI Installer

This folder contains platform-specific installation scripts for the Astra CLI tool.

## Quick Start

- **Windows**: Run `install.bat` (requires PowerShell)
- **Linux/macOS**: Run `bash install.sh`

## What Gets Installed

The installer sets up:

1. **Node.js** (if not already installed) - JavaScript runtime
2. **Bun** (if not already installed) - Required runtime for Astra
3. **astrabot** (npm package) - Exposed as the `astra` command
4. **Config directory** at `~/.astra/` - Stores your API keys and configuration

## Installation Steps

Both scripts perform these steps:

| Step | Description |
|------|-------------|
| 1 | Check for/install Node.js |
| 2 | Verify npm availability |
| 3 | Check for/install Bun runtime |
| 4 | Install astrabot globally via npm |
| 5 | Refresh PATH to expose `astra` command |
| 6 | Create config directory (`~/.astra/`) |

## After Installation

```bash
# Configure your API keys
astra setup

# Start Astra
astra wakeup
```

## Requirements

- **Windows**: PowerShell (for Node.js auto-install)
- **Linux/macOS**: curl (for Node.js and Bun auto-install)

## Troubleshooting

- If `astra` isn't recognized, restart your terminal
- On Linux, you may need to run with `sudo` for global npm installs
- If installations fail, install Node.js and Bun manually from:
  - Node.js: https://nodejs.org
  - Bun: https://bun.sh